import { IsString, Matches, MaxLength } from 'class-validator';

export class UploadImageDto {
  @IsString()
  @MaxLength(3_000_000)
  @Matches(/^data:image\/(png|jpe?g|webp);base64,.+$/, {
    message: 'image must be a base64 image data URI',
  })
  image: string;
}
