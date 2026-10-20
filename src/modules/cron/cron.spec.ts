import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { SchedulerAuthGuard } from '../../common/guards/scheduler-auth.guard';
import { CronController } from './cron.controller';

const INVOKER = 'cloud-scheduler-invoker@electronplus-ve.iam.gserviceaccount.com';
const AUDIENCE = 'https://api.example.run.app';

function guardWith(env: Record<string, string | undefined>) {
  return new SchedulerAuthGuard({ get: (key: string) => env[key] } as never);
}

function requestWith(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}

function tokenFor(payload: object | Error) {
  return jest
    .spyOn(OAuth2Client.prototype, 'verifyIdToken')
    .mockImplementation((() =>
      payload instanceof Error
        ? Promise.reject(payload)
        : Promise.resolve({ getPayload: () => payload })) as never);
}

describe('SchedulerAuthGuard', () => {
  const configured = { SCHEDULER_INVOKER_EMAIL: INVOKER, SCHEDULER_AUDIENCE: AUDIENCE };
  afterEach(() => jest.restoreAllMocks());

  it('hides the endpoints (404) while Cloud Scheduler is not configured', async () => {
    await expect(guardWith({}).canActivate(requestWith('Bearer x'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a request with no token', async () => {
    await expect(guardWith(configured).canActivate(requestWith())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a verified token for the invoker account, checked against the audience', async () => {
    const verify = tokenFor({ email: INVOKER, email_verified: true });
    await expect(guardWith(configured).canActivate(requestWith('Bearer good'))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith({ idToken: 'good', audience: AUDIENCE });
  });

  it('rejects a valid Google token for any other account', async () => {
    tokenFor({ email: 'someone@gmail.com', email_verified: true });
    await expect(
      guardWith(configured).canActivate(requestWith('Bearer other')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token that fails verification (wrong audience, expired, forged)', async () => {
    tokenFor(new Error('Wrong recipient'));
    await expect(
      guardWith(configured).canActivate(requestWith('Bearer forged')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('CronController', () => {
  function controller(
    overrides: {
      erpConfigured?: boolean;
      rollup?: object | undefined;
      mercasist?: { configured?: boolean; enabled?: boolean; skipped?: string };
    } = {},
  ) {
    const erpSync = {
      isConfigured: () => overrides.erpConfigured ?? false,
      runInboundSync: jest.fn().mockResolvedValue({ status: 'success', itemsProcessed: 3 }),
    };
    const secondStoreSync = {
      isConfigured: () => true,
      runInboundSync: jest
        .fn()
        .mockResolvedValue({ fromBridge: 2, created: 0, updated: 1, unchanged: 1 }),
    };
    const reports = {
      rollupYesterday: jest
        .fn()
        .mockResolvedValue('rollup' in overrides ? overrides.rollup : { date: '2026-10-02' }),
    };
    const dueChecks = { recomputeDueStatuses: jest.fn().mockResolvedValue(undefined) };
    const erpExport = {
      exportPending: jest.fn().mockResolvedValue({ exported: 1, failed: 0, waiting: 0 }),
    };
    const mercasistClient = { isConfigured: () => overrides.mercasist?.configured ?? false };
    const mercasist = {
      readSettings: jest.fn().mockResolvedValue({ enabled: overrides.mercasist?.enabled }),
      run: jest.fn().mockResolvedValue({
        summary: { publications: 5, matched: 4, updated: 2, newSales: 1 },
        ...(overrides.mercasist?.skipped && { skipped: overrides.mercasist.skipped }),
      }),
    };
    return {
      erpSync,
      erpExport,
      mercasist,
      cron: new CronController(
        erpSync as never,
        erpExport as never,
        secondStoreSync as never,
        reports as never,
        dueChecks as never,
        dueChecks as never,
        mercasistClient as never,
        mercasist as never,
      ),
    };
  }

  it('touches nothing until the principal bridge is configured', async () => {
    const { cron, erpSync, erpExport } = controller();
    expect(await cron.runErpSync()).toMatchObject({ status: 'skipped' });
    expect(erpSync.runInboundSync).not.toHaveBeenCalled();
    expect(erpExport.exportPending).not.toHaveBeenCalled();
  });

  it('retries pending sale reports on every tick once configured', async () => {
    const { cron, erpExport } = controller({ erpConfigured: true });
    expect(await cron.runErpSync()).toMatchObject({ exports: { exported: 1 } });
    expect(erpExport.exportPending).toHaveBeenCalledTimes(1);
  });

  it('runs the principal sync once configured', async () => {
    const { cron } = controller({ erpConfigured: true });
    expect(await cron.runErpSync()).toEqual({
      status: 'success',
      itemsProcessed: 3,
      exports: { exported: 1, failed: 0, waiting: 0 },
    });
  });

  it('reports the second-store sync result', async () => {
    expect(await controller().cron.runSecondStoreSync()).toMatchObject({
      status: 'success',
      updated: 1,
    });
  });

  it('answers 5xx when the nightly rollup failed, so Scheduler shows the run as failed', async () => {
    await expect(controller({ rollup: undefined }).cron.runDaily()).rejects.toThrow(
      'Sales rollup failed',
    );
    expect(await controller().cron.runDaily()).toEqual({
      status: 'success',
      salesRollup: '2026-10-02',
    });
  });

  describe('mercasist-sync', () => {
    it('skips until the token is set', async () => {
      const { cron, mercasist } = controller();
      expect(await cron.runMercasistSync()).toMatchObject({ status: 'skipped' });
      expect(mercasist.run).not.toHaveBeenCalled();
    });

    it("skips while an admin hasn't turned it on", async () => {
      const { cron, mercasist } = controller({ mercasist: { configured: true, enabled: false } });
      expect(await cron.runMercasistSync()).toMatchObject({
        status: 'skipped',
        reason: expect.stringContaining('desactivada'),
      });
      expect(mercasist.run).not.toHaveBeenCalled();
    });

    it('runs and reports the summary once on', async () => {
      const { cron } = controller({ mercasist: { configured: true, enabled: true } });
      expect(await cron.runMercasistSync()).toEqual({
        status: 'success',
        publications: 5,
        matched: 4,
        updated: 2,
        newSales: 1,
      });
    });

    it("reports a run that waited for tomorrow's quota as skipped", async () => {
      const { cron } = controller({
        mercasist: { configured: true, enabled: true, skipped: 'Quedan 10 solicitudes' },
      });
      expect(await cron.runMercasistSync()).toEqual({
        status: 'skipped',
        reason: 'Quedan 10 solicitudes',
      });
    });
  });
});
