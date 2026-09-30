# Camada desktop

O Electron é a "casca" do Almoxarifado Local. A interface continua em Next.js e o banco é SQLite.

Ao abrir (`main.cjs`):

1. Garante que existe só uma instância aberta.
2. Escolhe a pasta de dados:
   - `ALMOXARIFADO_DATA_DIR`, se definido;
   - versão portátil ou ZIP → `Almoxarifado-Dados` ao lado do `.exe`;
   - versão instalada (existe `Uninstall *.exe` ao lado) → `%APPDATA%\Almoxarifado Local\data`.
3. Inicia `next start` em `127.0.0.1`, numa porta livre, usando o Node embutido no Electron (`ELECTRON_RUN_AS_NODE`).
4. Grava a saída do servidor em `<dados>/logs/servidor.log`.
5. Abre a janela quando o servidor responde.

Em desenvolvimento (`npm run desktop:dev`), o Electron só abre a janela apontando para o `next dev` em `http://127.0.0.1:3000`.
