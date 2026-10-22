import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';

// All queue mutations are one Redis operation, including expiry and promotion.
export const WAITING_ROOM_LUA = `
local now=tonumber(ARGV[1]); local user=ARGV[2]; local cap=tonumber(ARGV[3]); local lease=tonumber(ARGV[4]); local ttl=tonumber(ARGV[5]);
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now)
local gone=redis.call('ZRANGEBYSCORE',KEYS[3],'-inf',now)
for _,id in ipairs(gone) do redis.call('ZREM',KEYS[2],id) end
redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',now)
if redis.call('ZSCORE',KEYS[1],user) then return {1,0,tonumber(redis.call('ZSCORE',KEYS[1],user))} end
if not redis.call('ZSCORE',KEYS[2],user) then redis.call('ZADD',KEYS[2],redis.call('INCR',KEYS[4]),user) end
redis.call('ZADD',KEYS[3],now+ttl,user)
local room=cap-redis.call('ZCARD',KEYS[1]);
if room>0 then
local promote=redis.call('ZRANGE',KEYS[2],0,room-1)
for _,id in ipairs(promote) do redis.call('ZREM',KEYS[2],id); redis.call('ZREM',KEYS[3],id); redis.call('ZADD',KEYS[1],now+lease,id) end
end
for _,key in ipairs(KEYS) do redis.call('EXPIRE',key,math.ceil((ttl+lease)/1000)+60) end
local expiry=redis.call('ZSCORE',KEYS[1],user)
if expiry then return {1,0,tonumber(expiry)} end
return {0,redis.call('ZRANK',KEYS[2],user)+1,0}
`;
export const BOOKING_LIMIT_LUA = `
local retry=0
for i,key in ipairs(KEYS) do
 local n=tonumber(redis.call('GET',key) or '0')
 if n>=tonumber(ARGV[i]) then retry=math.max(retry,1,redis.call('TTL',key)) end
end
if retry>0 then return retry end
for _,key in ipairs(KEYS) do if redis.call('INCR',key)==1 then redis.call('EXPIRE',key,60) end end
return 0
`;
export function boundedConfig(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (value === undefined || value === '') return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max)
    throw Error('Invalid booking access configuration');
  return result;
}
@Injectable()
export class BookingAccessService {
  readonly capacity: number;
  readonly leaseMs: number;
  private readonly prefix: string;
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    this.capacity = boundedConfig(
      config.get('WAITING_ROOM_CAPACITY'),
      0,
      0,
      10000,
    );
    this.leaseMs =
      boundedConfig(config.get('WAITING_ROOM_LEASE_SECONDS'), 120, 10, 3600) *
      1000;
    this.prefix = `booking:${config.get('APP_ENV') ?? 'local'}`;
  }
  private keys(showtimeId: string) {
    return ['active', 'queue', 'heartbeat', 'sequence'].map(
      (suffix) => `${this.prefix}:{${showtimeId}}:${suffix}`,
    );
  }
  async join(showtimeId: string, userId: string) {
    if (!this.capacity)
      return { enabled: false, admitted: true, position: 0, expiresAt: null };
    try {
      const [admitted, position, expiry] = (await this.redis.eval(
        WAITING_ROOM_LUA,
        4,
        ...this.keys(showtimeId),
        Date.now(),
        userId,
        this.capacity,
        this.leaseMs,
        60000,
      )) as number[];
      return {
        enabled: true,
        admitted: admitted === 1,
        position,
        expiresAt: expiry ? new Date(expiry).toISOString() : null,
      };
    } catch {
      throw new ServiceUnavailableException(
        'Phòng chờ tạm thời chưa sẵn sàng. Hãy thử lại.',
      );
    }
  }
  async admitted(showtimeId: string, userId: string) {
    if (!this.capacity) return true;
    try {
      return (
        Number(
          (await this.redis.zscore(this.keys(showtimeId)[0], userId)) ?? 0,
        ) > Date.now()
      );
    } catch {
      throw new ServiceUnavailableException(
        'Không thể xác nhận lượt vào đặt vé.',
      );
    }
  }
  async limit(route: 'hold' | 'order', userId: string, ip: string) {
    const fallback = route === 'hold' ? 60 : 15;
    const perUser = boundedConfig(
      this.config.get(`BOOKING_${route.toUpperCase()}_ACCOUNT_LIMIT`),
      fallback,
      1,
      10000,
    );
    const perIp = boundedConfig(
      this.config.get(`BOOKING_${route.toUpperCase()}_IP_LIMIT`),
      // Shared campus/company networks can contain hundreds of buyers.
      // Per-account limits remain independent; these are starting staging limits.
      route === 'hold' ? 6000 : 1500,
      1,
      100000,
    );
    const digest = (s: string) => createHash('sha256').update(s).digest('hex');
    try {
      return Number(
        await this.redis.eval(
          BOOKING_LIMIT_LUA,
          2,
          `${this.prefix}:limit:${route}:user:${digest(userId)}`,
          `${this.prefix}:limit:${route}:ip:${digest(ip)}`,
          perUser,
          perIp,
        ),
      );
    } catch {
      throw new ServiceUnavailableException(
        'Không thể kiểm tra tần suất đặt vé. Hãy thử lại.',
      );
    }
  }
}
