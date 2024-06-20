const config = () => ({
  environment: process.env.NODE_ENV,
  core_database: {
    host: process.env.DB_CORE_HOST,
    port: parseInt(process.env.DB_CORE_PORT || '', 10) || 5432,
    username: process.env.DB_CORE_USERNAME,
    password: process.env.DB_CORE_PASSWORD,
    database: process.env.DB_CORE_DATABASE
  },
});

export default config;
