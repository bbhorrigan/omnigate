import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { SaaSMapping } from '../entities/SaaSMapping';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'auth_middleware',
  entities: [User, SaaSMapping],
  synchronize: true,
  logging: false,
});

export const initDB = async () => {
  try {
    await AppDataSource.initialize();
    console.log('Database connected');
  } catch (error) {
    console.error('Database connection failed', error);
    process.exit(1);
  }
};
