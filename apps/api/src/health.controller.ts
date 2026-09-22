import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true, time: new Date().toISOString() };
  }
}
