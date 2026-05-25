const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "host.docker.internal",
  port: 3006,
  charset: "utf8mb4",
  user: "root",
  password: "iq@2013tex",
  database: "chatbot",
  timezone: "Z", // Define que o Node enviará em UTC ou formato neutro
  typeCast: true, // Garante que datas virem objetos Date do JS corretamente
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
