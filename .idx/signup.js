document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signup-form');
    const notificationDiv = document.getElementById('notification');

    // Fungsi untuk menampilkan notifikasi (bisa dibuat menjadi modul terpisah nanti)
    const showNotification = (message, type) => {
        notificationDiv.textContent = message;
        notificationDiv.className = `notification ${type}`;
        notificationDiv.style.display = 'block';

        setTimeout(() => {
            notificationDiv.style.display = 'none';
        }, 5000);
    };

    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            // Validasi sederhana di sisi klien
            if (password !== confirmPassword) {
                showNotification('Password dan konfirmasi password tidak cocok.', 'error');
                return;
            }

            // Membuat pengguna baru dengan Firebase Auth
            auth.createUserWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    // Pendaftaran berhasil, pengguna otomatis login
                    const user = userCredential.user;
                    console.log('Pendaftaran berhasil untuk UID:', user.uid);

                    // Simpan informasi pengguna dan peran default ke Firestore
                    return db.collection('users').doc(user.uid).set({
                        email: user.email,
                        role: 'staf', // Peran default untuk pengguna baru
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    }).then(() => {
                        showNotification('Pendaftaran berhasil! Anda akan dialihkan ke dashboard.', 'success');
                        // Arahkan ke dashboard setelah 2 detik
                        setTimeout(() => {
                            window.location.href = 'dashboard.html';
                        }, 2000);
                    });
                })
                .catch((error) => {
                    console.error('Error pendaftaran:', error.message);
                    // Memberikan pesan error yang lebih ramah
                    if (error.code === 'auth/email-already-in-use') {
                        showNotification('Email ini sudah terdaftar. Silakan gunakan email lain.', 'error');
                    } else if (error.code === 'auth/weak-password') {
                        showNotification('Password terlalu lemah. Gunakan minimal 6 karakter.', 'error');
                    } else {
                        showNotification(`Error: ${error.message}`, 'error');
                    }
                });
        });
    }
});