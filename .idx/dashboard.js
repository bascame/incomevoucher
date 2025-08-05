document.addEventListener('DOMContentLoaded', () => {
    const userEmailSpan = document.getElementById('user-email');
    const logoutButton = document.getElementById('logout-button');
    const addVoucherForm = document.getElementById('add-voucher-form');
    const voucherList = document.getElementById('voucher-list');
    const searchInput = document.getElementById('search-input');
    const tableHeader = document.querySelector('#voucher-table thead');
    const exportCsvButton = document.getElementById('export-csv-btn');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterDateButton = document.getElementById('filter-date-btn');
    const showArchivedCheckbox = document.getElementById('show-archived-checkbox');
    const exportPdfButton = document.getElementById('export-pdf-btn');
    
    // Import elements
    const importCsvForm = document.getElementById('import-csv-form');
    const csvFileInput = document.getElementById('csv-file');
    const importStatusDiv = document.getElementById('import-status');

    // Notification elements
    const notificationBell = document.querySelector('.notification-bell');
    const notificationBadge = document.getElementById('notification-badge');
    const notificationDropdown = document.getElementById('notification-dropdown');
    const notificationList = document.getElementById('notification-list');
    const makeAdminForm = document.getElementById('make-admin-form');

    // Modal elements
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-voucher-form');
    const closeModalButton = document.querySelector('.close-button');

    // Pagination elements
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const pageInfoSpan = document.getElementById('page-info');

    // Pagination State
    const VOUCHERS_PER_PAGE = 5;
    let pageQueryStack = [null]; // Menyimpan cursor untuk setiap halaman
    let currentPage = 1;

    // Sorting State
    let sortField = 'createdAt';
    let sortDirection = 'desc';

    // Filter State
    let showArchived = false;

    // Chart State
    let voucherStatsChart = null;
    let voucherUsageChart = null;

    // Notification State
    let unreadCount = 0;
    let initialLoadTimestamp = null;
    let notificationListener = null; // Untuk menyimpan fungsi unsubscribe listener

    let currentUserRole = null; // Variabel untuk menyimpan peran pengguna

    // 1. Periksa status otentikasi pengguna
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // Pengguna sudah login
            console.log('Pengguna terautentikasi:', user.email);
            userEmailSpan.textContent = user.email;

            // Ambil data peran pengguna dari Firestore
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    currentUserRole = userDoc.data().role;
                    console.log('Peran pengguna:', currentUserRole);
                    // Terapkan UI berdasarkan peran
                    applyRoleBasedUI(currentUserRole);
                    // Muat data voucher setelah peran diketahui
                    loadVouchersPage();
                    setupRealtimeNotifications(user.uid); // Mulai listener notifikasi
                    updateStatsChart(); // Muat data untuk bagan
                    updateUsageChart(); // Muat data untuk bagan penggunaan
                } else {
                    throw new Error('Dokumen pengguna tidak ditemukan di Firestore!');
                }
            } catch (error) {
                console.error(error);
                alert('Gagal memuat data pengguna. Anda akan logout.');
                auth.signOut();
            }
        } else {
            // Pengguna belum login, arahkan kembali ke halaman login
            console.log('Tidak ada pengguna yang login, mengalihkan...');
            window.location.href = 'index.html';
        }
    });

    // 2. Fungsi Logout
    logoutButton.addEventListener('click', () => {
        auth.signOut().then(() => {
            console.log('Logout berhasil.');
            // Pengalihan akan ditangani oleh onAuthStateChanged
        }).catch(error => {
            console.error('Logout gagal:', error);
        });
    });

    // 3. Tambah Voucher Baru
    addVoucherForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const code = document.getElementById('voucher-code').value;
        const discount = parseInt(document.getElementById('voucher-discount').value);
        const status = document.getElementById('voucher-status').value;
        const expiresAtInput = document.getElementById('voucher-expires-at').value;

        const newVoucher = {
            code: code,
            discount: discount,
            status: status,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastUpdatedBy: auth.currentUser.uid, // Diperlukan untuk notifikasi
            usageCount: 0, // Inisialisasi penghitung penggunaan
            isArchived: false,
        };

        if (expiresAtInput) {
            newVoucher.expiresAt = firebase.firestore.Timestamp.fromDate(new Date(expiresAtInput));
        }

        db.collection('vouchers').add(newVoucher)
        .then((docRef) => {
            console.log("Voucher berhasil ditambahkan dengan ID: ", docRef.id);
            addVoucherForm.reset(); // Kosongkan form setelah berhasil
        })
        .catch((error) => {
            console.error("Error menambahkan voucher: ", error);
            alert("Gagal menambahkan voucher. Silakan coba lagi.");
        });
    });

    // Fungsi untuk menerapkan UI berdasarkan peran
    const applyRoleBasedUI = (role) => {
        const addVoucherCard = document.querySelector('.form-card');
        const adminActionsCard = document.getElementById('admin-actions-card');
        const importCsvCard = document.getElementById('import-csv-card');

        if (role === 'admin') {
            // Admin bisa melihat form tambah voucher
            addVoucherCard.style.display = 'block';
            adminActionsCard.style.display = 'block';
            importCsvCard.style.display = 'block';
        } else {
            // Staf (atau peran lain) tidak bisa melihat form tambah voucher
            addVoucherCard.style.display = 'none';
            adminActionsCard.style.display = 'none';
            importCsvCard.style.display = 'none';
        }
    };

    // 4. Fungsi untuk merender baris tabel
    const renderVouchers = (docs) => {
      voucherList.innerHTML = ''; // Kosongkan daftar sebelum mengisi ulang

    // 5. Fungsi untuk memuat halaman voucher (PAGINASI)
    const loadVouchersPage = async (startDate = null, endDate = null) => {
        // Nonaktifkan tombol selama proses fetch
        prevPageButton.disabled = true;
        nextPageButton.disabled = true;

        // Filter utama berdasarkan status arsip
        let query = db.collection('vouchers').where('isArchived', '==', showArchived);

        query = query.orderBy(sortField, sortDirection);

        if (startDate && endDate) {
            query = query.where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(startDate))
                         .where('createdAt', '<=', firebase.firestore.Timestamp.fromDate(endDate));
        }

        // Gunakan cursor dari halaman sebelumnya
        const startAfterDoc = pageQueryStack[currentPage - 1];
        if (startAfterDoc) {
            query = query.startAfter(startAfterDoc);
        }

        const snapshot = await query.limit(VOUCHERS_PER_PAGE).get();
        const docs = snapshot.docs;

        renderVouchers(docs);

        // Simpan cursor untuk halaman berikutnya
        if (docs.length > 0) {
            const lastDoc = docs[docs.length - 1];
            pageQueryStack[currentPage] = lastDoc;
        }

        // Cek apakah ada halaman berikutnya untuk mengaktifkan tombol "Next"
        const hasNextPage = docs.length === VOUCHERS_PER_PAGE;
        nextPageButton.disabled = !hasNextPage;
        prevPageButton.disabled = currentPage === 1;
        pageInfoSpan.textContent = `Halaman ${currentPage}`;
    };

    showArchivedCheckbox.addEventListener('change', () => {
        showArchived = showArchivedCheckbox.checked;
        currentPage = 1;
        pageQueryStack = [null];
        loadVouchersPage();
    });

    
        if (docs.length === 0) {
            voucherList.innerHTML = `<tr><td colspan="4" style="text-align:center;">Voucher tidak ditemukan.</td></tr>`;
            return;
        }
        docs.forEach((doc) => {
            const voucher = doc.data();
            const row = document.createElement('tr');
            row.setAttribute('data-id', doc.id);
            
            row.innerHTML = `
                <td>${voucher.code}</td>
                <td>${voucher.discount}%</td>
                <td><span class="status-${voucher.status.replace(' ', '-')}">${voucher.status}</span></td>
                ${currentUserRole === 'admin' ? `
                    <td>
                        <button class="action-btn edit-btn" data-id="${doc.id}"><i class="fas fa-edit"></i> Edit</button>
                        <button class="action-btn delete-btn" data-id="${doc.id}"><i class="fas fa-trash"></i> Hapus</button>
                        <button class="action-btn log-btn" data-id="${doc.id}"><i class="fas fa-history"></i> Riwayat</button>
                        <button class="action-btn use-btn" data-id="${doc.id}"><i class="fas fa-check"></i> Gunakan</button>
                    </td>
                ` : `
                    <td>-</td>
                `}
            `;
            voucherList.appendChild(row);
        });
    };

    // Fungsi untuk memperbarui ikon pengurutan di header
    const updateSortIcons = () => {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            const icon = th.querySelector('.sort-icon');
            th.classList.remove('sorted');
            icon.className = 'sort-icon fas fa-sort'; // Reset ikon

            if (th.getAttribute('data-sort') === sortField) {
                th.classList.add('sorted');
                if (sortDirection === 'asc') {
                    icon.className = 'sort-icon fas fa-sort-up';
                } else {
                    icon.className = 'sort-icon fas fa-sort-down';
                }
            }
        });
    };

    // Event listener untuk pengurutan tabel
    tableHeader.addEventListener('click', (e) => {
        const targetHeader = e.target.closest('th[data-sort]');
        if (!targetHeader) return;

        const newSortField = targetHeader.getAttribute('data-sort');

        if (sortField === newSortField) {
            // Balik arah jika kolom yang sama diklik
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            // Atur ke kolom baru dengan arah default 'asc'
            sortField = newSortField;
            sortDirection = 'asc';
        }

        // Reset paginasi dan muat ulang data
        currentPage = 1;
        pageQueryStack = [null];
        loadVouchersPage();
        updateSortIcons();
    });

    // Event listener untuk tombol paginasi
    nextPageButton.addEventListener('click', () => {
        currentPage++;
        loadVouchersPage();
    });

    prevPageButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadVouchersPage();
        }
    });

    // 6. Event listener untuk input pencarian
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.trim();

        if (searchTerm) {
            // Jika ada input, lakukan pencarian dan sembunyikan paginasi
            document.querySelector('.pagination-container').style.display = 'none';
            searchVouchers(searchTerm);
        } else {
            // Jika input kosong, tampilkan kembali paginasi dan muat halaman pertama
            document.querySelector('.pagination-container').style.display = 'flex';
            currentPage = 1;
            pageQueryStack = [null]; // Reset stack paginasi
            loadVouchersPage();
        }
    });

    // Fungsi untuk PENCARIAN
    const searchVouchers = (term) => {
        const query = db.collection('vouchers')
                        .where('isArchived', '==', showArchived)
                        .orderBy('code')
                        .where('code', '>=', term)
                        .where('code', '<=', term + '\uf8ff');
        
        // Menggunakan onSnapshot agar pencarian terasa real-time
        query.onSnapshot(snapshot => renderVouchers(snapshot.docs));
    };

    // 7. Event Listener untuk Aksi (Edit/Hapus) menggunakan Event Delegation
    voucherList.addEventListener('click', (e) => {
        // Pastikan yang diklik adalah tombol atau ikon di dalam tombol
        const target = e.target.closest('.action-btn');
        if (!target) return;

        // Perbaikan Bug: Hanya admin yang bisa melakukan aksi
        if (currentUserRole !== 'admin') {
            console.warn('Aksi diblokir: pengguna bukan admin.');
            return;
        }

        const id = target.getAttribute('data-id');

        if (target.classList.contains('delete-btn')) {
            // Aksi Hapus
            if (confirm('Apakah Anda yakin ingin menghapus voucher ini?')) {
                archiveVoucher(id); // Ganti delete dengan archive
            }
        }

        if (target.classList.contains('edit-btn')) {
            // Aksi Edit
            openEditModal(id);
        }

        if (target.classList.contains('use-btn')) {
            // Aksi "Gunakan" Voucher
            incrementUsage(id);
        }
    });

    // Fungsi untuk menaikkan hitungan penggunaan voucher
    const incrementUsage = (id) => {
        const voucherRef = db.collection('vouchers').doc(id);
        // Gunakan FieldValue.increment untuk operasi atomik yang aman
        voucherRef.update({
            usageCount: firebase.firestore.FieldValue.increment(1)
        }).then(() => {
            console.log(`Usage count untuk voucher ${id} berhasil dinaikkan.`);
            updateUsageChart(); // Perbarui bagan penggunaan
        }).catch(error => console.error("Gagal menaikkan usage count:", error));
    };

    // 8. Fungsi untuk mengarsipkan voucher (sebelumnya delete)
    const archiveVoucher = (id) => {
        db.collection('vouchers').doc(id).update({
            isArchived: true,
            status: 'tidak aktif'
        }).then(() => {
            console.log('Voucher berhasil diarsipkan.');
            loadVouchersPage();
            updateStatsChart();
            updateUsageChart();
        }).catch(error => console.error("Gagal mengarsipkan voucher:", error));
    };

    // 9. Fungsi untuk membuka dan mengisi modal edit
    const openEditModal = (id) => {
        db.collection('vouchers').doc(id).get()
            .then((doc) => {
                if (doc.exists) {
                    const voucher = doc.data();
                    document.getElementById('edit-voucher-id').value = doc.id;
                    document.getElementById('edit-voucher-code').value = voucher.code;
                    document.getElementById('edit-voucher-discount').value = voucher.discount;
                    document.getElementById('edit-voucher-status').value = voucher.status;
                    // Format tanggal untuk input type="date" (YYYY-MM-DD)
                    if (voucher.expiresAt) {
                        const date = voucher.expiresAt.toDate();
                        const year = date.getFullYear();
                        const month = ('0' + (date.getMonth() + 1)).slice(-2);
                        const day = ('0' + date.getDate()).slice(-2);
                        document.getElementById('edit-voucher-expires-at').value = `${year}-${month}-${day}`;
                    }
                    editModal.style.display = 'block';
                } else {
                    console.log('Dokumen tidak ditemukan!');
                    alert('Data voucher tidak ditemukan.');
                }
            })
            .catch((error) => {
                console.error('Error mengambil data untuk diedit: ', error);
            });
    };

    // 10. Fungsi untuk menutup modal
    const closeEditModal = () => {
        editModal.style.display = 'none';
    };

    closeModalButton.addEventListener('click', closeEditModal);
    window.addEventListener('click', (event) => {
        if (event.target == editModal) {
            closeEditModal();
        }
    });

    // 11. Simpan perubahan dari form edit
    editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-voucher-id').value;
        const updatedData = {
            code: document.getElementById('edit-voucher-code').value,
            discount: parseInt(document.getElementById('edit-voucher-discount').value),
            status: document.getElementById('edit-voucher-status').value,
            lastUpdatedBy: auth.currentUser.uid
        };

        const expiresAtInput = document.getElementById('edit-voucher-expires-at').value;
        if (expiresAtInput) {
            updatedData.expiresAt = firebase.firestore.Timestamp.fromDate(new Date(expiresAtInput));
        }

        db.collection('vouchers').doc(id).update(updatedData)
            .then(() => {
                console.log('Voucher berhasil diperbarui');
                closeEditModal();
                loadVouchersPage(); // Muat ulang tabel untuk melihat perubahan
                updateStatsChart(); // Perbarui bagan
            })
            .catch((error) => {
                console.error('Error memperbarui voucher: ', error);
                alert('Gagal memperbarui voucher.');
            });
    });

    // 12. Event listener untuk form "Jadikan Admin"
    if (makeAdminForm) {
        makeAdminForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('admin-email').value;

            if (!confirm(`Apakah Anda yakin ingin menjadikan ${email} sebagai admin?`)) {
                return;
            }

            const adminNotification = document.getElementById('admin-notification');
            const submitButton = makeAdminForm.querySelector('button');
            submitButton.disabled = true;
            submitButton.textContent = 'Memproses...';

            // Panggil Cloud Function
            const makeAdmin = functions.httpsCallable('makeAdmin');
            makeAdmin({ email: email })
                .then((result) => {
                    alert(result.data.message);
                    makeAdminForm.reset();
                })
                .catch((error) => {
                    console.error('Error:', error.message);
                    alert(`Gagal: ${error.message}`);
                })
                .finally(() => {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Jadikan Admin';
                });
        });
    }

    // 13. Fungsi untuk mengekspor data ke CSV
    const exportVouchersToCSV = async () => {
        exportCsvButton.disabled = true;
        exportCsvButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengekspor...';

        try {
            // Ambil SEMUA voucher, abaikan paginasi
            const snapshot = await db.collection('vouchers')
                                     .where('isArchived', '==', showArchived)
                                     .orderBy('createdAt', 'desc').get();
            if (snapshot.empty) {
                alert('Tidak ada data untuk diekspor.');
                return;
            }

            const vouchersData = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                vouchersData.push({
                    id: doc.id,
                    code: data.code,
                    discount: data.discount,
                    status: data.status,
                    createdAt: data.createdAt ? data.createdAt.toDate().toLocaleString('id-ID') : 'N/A'
                });
            });

            // Konversi data JSON ke string CSV
            const headers = ['ID', 'Kode Voucher', 'Diskon (%)', 'Status', 'Tanggal Dibuat'];
            const csvRows = [headers.join(',')];

            for (const row of vouchersData) {
                // Menggunakan JSON.stringify untuk menangani koma atau karakter khusus di dalam nilai
                const values = headers.map(header => {
                    const key = header.toLowerCase().replace(' (%)', '').replace(' ', '');
                    const escaped = ('' + row[key]).replace(/"/g, '""'); // Escape double quotes
                    return `"${escaped}"`;
                });
                csvRows.push(values.join(','));
            }

            const csvString = csvRows.join('\n');
            
            // Buat file dan picu unduhan
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const date = new Date().toISOString().slice(0, 10);
            link.setAttribute('download', `export-vouchers-${date}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Gagal mengekspor CSV:", error);
            alert("Terjadi kesalahan saat mengekspor data.");
        } finally {
            exportCsvButton.disabled = false;
            exportCsvButton.innerHTML = '<i class="fas fa-file-csv"></i> Export ke CSV';
        }
    };

    exportCsvButton.addEventListener('click', exportVouchersToCSV);
    exportPdfButton.addEventListener('click', exportToPDF);


    // 15. Logika Notifikasi Real-time
    const setupRealtimeNotifications = (currentUserId) => {
        if (notificationListener) {
            notificationListener(); // Hentikan listener lama jika ada
        }

        initialLoadTimestamp = firebase.firestore.Timestamp.now();

        notificationListener = db.collection('vouchers')
            .where('createdAt', '>', initialLoadTimestamp)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const voucher = change.doc.data();
                        // Hindari notifikasi untuk aksi sendiri
                        if (voucher.lastUpdatedBy !== currentUserId) {
                            addNotification(voucher);
                        }
                    }
                });
            }, error => {
                console.error("Error pada listener notifikasi:", error);
            });
    };

    const addNotification = (voucher) => {
        unreadCount++;
        notificationBadge.textContent = unreadCount;
        notificationBadge.style.display = 'block';

        const noNotificationMsg = notificationList.querySelector('.no-notification');
        if (noNotificationMsg) noNotificationMsg.remove();

        const li = document.createElement('li');
        li.classList.add('unread');
        li.innerHTML = `
            <p>Voucher baru <strong>${voucher.code}</strong> telah ditambahkan.</p>
            <span>Baru saja</span>
        `;
        notificationList.prepend(li);
    };

    notificationBell.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = notificationDropdown.style.display === 'block';
        notificationDropdown.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) { // Jika dropdown dibuka
            unreadCount = 0;
            notificationBadge.style.display = 'none';
            notificationList.querySelectorAll('li.unread').forEach(item => item.classList.remove('unread'));
        }
    });

    window.addEventListener('click', () => {
        if (notificationDropdown.style.display === 'block') {
            notificationDropdown.style.display = 'none';
        }
    });

    // 16. Fungsi untuk memvisualisasikan data dengan Chart.js
    const updateStatsChart = async () => {
        try {
            // Ambil semua voucher untuk dihitung statusnya
            const snapshot = await db.collection('vouchers')
                                     .where('isArchived', '==', false)
                                     .get();
            
            let activeCount = 0;
            let inactiveCount = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.status === 'aktif') {
                    activeCount++;
                } else if (data.status === 'tidak aktif') {
                    inactiveCount++;
                }
            });

            const ctx = document.getElementById('voucher-stats-chart').getContext('2d');

            // Hancurkan instance chart lama jika ada untuk mencegah tumpang tindih
            if (voucherStatsChart) {
                voucherStatsChart.destroy();
            }

            voucherStatsChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Aktif', 'Tidak Aktif'],
                    datasets: [{
                        label: 'Status Voucher',
                        data: [activeCount, inactiveCount],
                        backgroundColor: [
                            'rgba(75, 192, 192, 0.7)',  // Teal
                            'rgba(255, 99, 132, 0.7)'   // Pink
                        ],
                        borderColor: [
                            'rgba(75, 192, 192, 1)',
                            'rgba(255, 99, 132, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                }
            });

        } catch (error) {
            console.error("Gagal memuat data untuk bagan:", error);
        }
    };

    // 17. Fungsi untuk memvisualisasikan penggunaan voucher
    const updateUsageChart = async () => {
        try {
            // Ambil 5 voucher teratas berdasarkan usageCount
            const snapshot = await db.collection('vouchers')
                                     .where('isArchived', '==', false)
                                     .orderBy('usageCount', 'desc')
                                     .limit(5)
                                     .get();

            const labels = [];
            const data = [];

            snapshot.forEach(doc => {
                const voucher = doc.data();
                // Hanya tampilkan di bagan jika pernah digunakan
                if (voucher.usageCount > 0) {
                    labels.push(voucher.code);
                    data.push(voucher.usageCount);
                }
            });

            const ctx = document.getElementById('voucher-usage-chart').getContext('2d');

            if (voucherUsageChart) {
                voucherUsageChart.destroy();
            }

            voucherUsageChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Jumlah Penggunaan',
                        data: data,
                        backgroundColor: 'rgba(118, 75, 162, 0.7)', // Purple
                        borderColor: 'rgba(118, 75, 162, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1 } // Pastikan sumbu Y adalah bilangan bulat
                        }
                    }
                }
            });
        } catch (error) {
            console.error("Gagal memuat data untuk bagan penggunaan:", error);
        }
    };

    // 18. Fungsi untuk mengekspor data yang difilter ke PDF
    const exportToPDF = async () => {
        exportPdfButton.disabled = true;
        exportPdfButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mencetak...';

        try {
            // 1. Bangun query berdasarkan filter yang aktif
            let query = db.collection('vouchers').where('isArchived', '==', showArchived);

            const startDate = startDateInput.value;
            const endDate = endDateInput.value;

            if (startDate && endDate) {
                const startDateObj = new Date(startDate);
                const endDateObj = new Date(endDate);
                endDateObj.setDate(endDateObj.getDate() + 1);

                query = query.where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(startDateObj))
                             .where('createdAt', '<=', firebase.firestore.Timestamp.fromDate(endDateObj));
            }

            // Terapkan pengurutan yang sama seperti di tabel
            query = query.orderBy(sortField, sortDirection);

            const snapshot = await query.get();
            if (snapshot.empty) {
                alert('Tidak ada data untuk dicetak berdasarkan filter saat ini.');
                return;
            }

            // 2. Siapkan data untuk tabel PDF
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const tableColumn = ["Kode Voucher", "Diskon (%)", "Status", "Digunakan", "Tgl Dibuat"];
            const tableRows = [];

            snapshot.forEach(doc => {
                const voucher = doc.data();
                const voucherData = [
                    voucher.code,
                    voucher.discount,
                    voucher.status,
                    voucher.usageCount || 0,
                    voucher.createdAt ? voucher.createdAt.toDate().toLocaleDateString('id-ID') : 'N/A'
                ];
                tableRows.push(voucherData);
            });

            // 3. Buat PDF
            doc.text("Laporan Data Voucher", 14, 15);
            doc.autoTable(tableColumn, tableRows, { startY: 20 });
            
            const date = new Date().toISOString().slice(0, 10);
            doc.save(`laporan-voucher-${date}.pdf`);

        } catch (error) {
            console.error("Gagal membuat PDF:", error);
            alert("Terjadi kesalahan saat membuat laporan PDF.");
        } finally {
            exportPdfButton.disabled = false;
            exportPdfButton.innerHTML = '<i class="fas fa-file-pdf"></i> Cetak ke PDF';
        }
    };
});