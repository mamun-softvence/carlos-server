import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { StudentModule } from './student/student.module';

@Module({
  controllers: [UserController],
  providers: [UserService],
  imports: [StudentModule],
})
export class UserModule {}
