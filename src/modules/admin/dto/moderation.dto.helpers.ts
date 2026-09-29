// Re-exports so the moderation DTO file reads as one declarative block
// instead of five import lines from two packages.
export {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export { Type } from 'class-transformer';
