import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  role: string;
  /** Distinguishes the two token types — see AuthService.issueTokenPair. */
  tokenType?: 'access' | 'refresh';
  jti?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET environment variable is not set');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload) {
    // Refresh tokens are signed with a different secret so they already fail
    // signature verification here; this check is the second lock in case both
    // secrets are ever (mis)configured to the same value.
    if (payload.tokenType && payload.tokenType !== 'access') {
      throw new UnauthorizedException(
        'This token type cannot be used to call the API',
      );
    }
    return { userId: payload.sub, role: payload.role };
  }
}
