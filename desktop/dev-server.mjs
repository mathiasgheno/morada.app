// Porta separada para não interferir na aplicação aberta no navegador.
process.env.PORT = '1420';
await import('../server.ts');
