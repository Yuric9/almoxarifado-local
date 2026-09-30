/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Módulo nativo: carregado do node_modules em tempo de execução, nunca empacotado.
    serverComponentsExternalPackages: ['better-sqlite3']
  }
}
