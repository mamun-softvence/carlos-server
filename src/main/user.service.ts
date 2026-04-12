import cloudinary from '@/lib/cloudinary/cloudinary';
import { PrismaService } from '@/lib/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfileImage(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ✅ Convert buffer → base64
    const base64 = file.buffer.toString('base64');

    const dataUri = `data:${file.mimetype};base64,${base64}`;

    // ✅ Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder: 'users/profile',
    });

    // ✅ Delete old image
    if (user.avatarPublicId) {
      await cloudinary.uploader.destroy(user.avatarPublicId);
    }

    // ✅ Save new image
    const updated = await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        avatarUrl: uploadResult.secure_url,
        avatarPublicId: uploadResult.public_id,
      },
    });

    return {
      success: true,
      message: 'Profile image updated successfully',
      data: updated,
    };
  }
}
