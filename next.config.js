/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Carregados do node_modules em tempo de execução, nunca empacotados (módulo nativo e leitor de PDF).
    serverComponentsExternalPackages: ['better-sqlite3', 'unpdf']
  }
}
