import 'dotenv/config';
import { ENVEnum } from '@/common/enum/env.enum';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env[ENVEnum.CLOUDINARY_CLOUD_NAME],
  api_key: process.env[ENVEnum.CLOUDINARY_API_KEY],
  api_secret: process.env[ENVEnum.CLOUDINARY_API_SECRET],
});

export default cloudinary;
