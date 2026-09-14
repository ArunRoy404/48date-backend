import { isEmail, registerDecorator } from 'class-validator';
import type { ValidationArguments, ValidationOptions } from 'class-validator';

const E164 = /^\+[1-9]\d{1,14}$/;

/**
 * Validates a contact `value` against the sibling `type` field.
 *
 * Two `@ValidateIf` decorators cannot express this: class-validator ANDs their
 * conditions, so `type === 'PHONE'` and `type === 'EMAIL'` together would mean
 * the field is never validated at all. One validator that reads the sibling is
 * the honest way to say "it depends".
 */
export function IsContactValue(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isContactValue',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string' || value.trim() === '') return false;

          const type = (args.object as { type?: unknown }).type;
          if (type === 'PHONE') return E164.test(value);
          if (type === 'EMAIL') return isEmail(value);

          // An unknown `type` is reported by that field's own validator; do not
          // pile a second confusing message on top.
          return true;
        },
        defaultMessage(args: ValidationArguments): string {
          const type = (args.object as { type?: unknown }).type;
          return type === 'EMAIL'
            ? 'Enter a valid email address.'
            : 'Enter your phone number with the country code, for example +8801811000001.';
        },
      },
    });
  };
}
