{ pkgs, ... }: {
  # Menentukan channel nixpkgs. 'stable-24.05' adalah pilihan yang baik untuk stabilitas.
  channel = "stable-24.05";

  # Daftar paket yang akan diinstal dari channel yang ditentukan.
  packages = [
    pkgs.nodejs_20,
    pkgs.firebase-tools # Menambahkan Firebase CLI
  ];

  # Konfigurasi untuk ekstensi dan fitur IDX.
  idx = {
    # Ekstensi VS Code yang direkomendasikan untuk diinstal.
    extensions = [
      "dbaeumer.vscode-eslint" # Untuk linting JavaScript
    ];

    # Mengonfigurasi pratinjau web untuk aplikasi Anda.
    previews = {
      enable = true;
      previews = {
        web = {
          # Perintah ini memulai server web yang menyajikan file dari direktori .idx Anda.
          command = ["npx", "http-server", ".idx", "-p", "$PORT", "--cors"];
          manager = "web";
        };
      };
    };
  };
}