// PENTING: Ganti placeholder di bawah dengan konfigurasi Firebase Anda yang sebenarnya.
// Simpan file ini secara lokal dan pastikan untuk TIDAK memasukkannya ke dalam sistem kontrol versi (misalnya, tambahkan ke .gitignore).
const firebaseConfig = {
  apiKey: "AIzaSyAVgyAbOJCPj1wp1vE8P7VMcW1QCIDwhuo",
  authDomain: "okok-41801483.firebaseapp.com",
  databaseURL: "https://okok-41801483-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "okok-41801483",
  storageBucket: "okok-41801483.firebasestorage.app",
  messagingSenderId: "588658271085",
  appId: "1:588658271085:web:44b85785161c324ae1f064"
};

// Inisialisasi layanan Firebase untuk digunakan di seluruh aplikasi
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();