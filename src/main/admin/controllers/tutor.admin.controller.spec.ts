import { Test, TestingModule } from '@nestjs/testing';
import { TutorAdminController } from './tutor.admin.controller';

describe('TutorAdminController', () => {
  let controller: TutorAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TutorAdminController],
    }).compile();

    controller = module.get<TutorAdminController>(TutorAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
