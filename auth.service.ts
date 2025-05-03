import { AppDataSource } from '../config/db';
import { User } from '../entities/User';
import { SaaSMapping } from '../entities/SaaSMapping';
import { cacheToken } from './cache';

export class AuthService {
  private userRepository = AppDataSource.getRepository(User);
  private mappingRepository = AppDataSource.getRepository(SaaSMapping);

  async findOrCreateUser(email: string): Promise<User> {
    let user = await this.userRepository.findOne({ where: { email } });
    
    if (!user) {
      user = new User();
      user.email = email;
      user = await this.userRepository.save(user);
    }

    return user;
  }

  async handleAuth(
    email: string,
    saasType: string,
    credentials: Record<string, any>
  ) {
    const user = await this.findOrCreateUser(email);
    
    // Store in PostgreSQL
    const mapping = new SaaSMapping();
    mapping.saasType = saasType;
    mapping.credentials = credentials;
    mapping.user = user;
    await this.mappingRepository.save(mapping);

    // Cache in Redis (TTL: 1 hour)
    await cacheToken(
      `user:${user.id}:${saasType}`,
      JSON.stringify(credentials),
      3600
    );

    return { success: true, userId: user.id };
  }
}
