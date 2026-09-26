import { registerDecorator, isURL } from 'class-validator';
import type { ValidationOptions } from 'class-validator';

/**
 * URL validation that can be relaxed per environment.
 *
 * `@IsUrl()` requires a real top-level domain, so a URL produced by the local
 * image-storage fallback (`http://localhost:3000/uploads/...`) is rejected —
 * which breaks the upload → profile-setup flow whenever Cloudflare R2 is not
 * configured.
 *
 * With `STRICT_URL_VALIDATION=false` (the local-development default) hosts
 * without a TLD such as `localhost` are accepted. Set it to `true` in
 * production, where every image URL comes from R2 and should be a real
 * public URL.
 *
 * The flag is read at validation time rather than when the decorator is
 * applied, so it does not depend on `.env` being loaded before the DTO module
 * is imported.
 */
export function IsPublicUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPublicUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          const strict = process.env.STRICT_URL_VALIDATION === 'true';
          return isURL(value, { require_tld: strict });
        },
        defaultMessage(): string {
          return process.env.STRICT_URL_VALIDATION === 'true'
            ? '$property must be a valid public URL'
            : '$property must be a valid URL';
        },
      },
    });
  };
}
