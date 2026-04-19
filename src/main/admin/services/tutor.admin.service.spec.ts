import { Test, TestingModule } from '@nestjs/testing';
import { TutorAdminService } from './tutor.admin.service';

describe('TutorAdminService', () => {
  let service: TutorAdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TutorAdminService],
    }).compile();

    service = module.get<TutorAdminService>(TutorAdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
