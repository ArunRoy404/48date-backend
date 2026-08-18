
export const databaseConfig = {
  url: process.env.DATABASE_URL!,

  pool: {
    min: 2,
    max: 10,
  },
} as const;
