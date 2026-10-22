import {beforeEach,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {ticketQrInput,parseTicketQr} from "shared/ticket-qr";
import {api,ApiError} from "@/lib/api/client";
import {loadCurrentUser} from "@/lib/api";
import {addPendingScan,getPendingScans,getPendingScanCount,_resetMemoryQueueForTesting,subscribePendingCount,type PendingScan} from "./offline-queue";
import {syncPendingScans,isSyncing} from "./sync-manager";
import {markServerOnline,getCurrentNetworkStatus,_setMockServerReachableForTesting} from "./network-status";
vi.mock("@/lib/api/client",async original=>({...await original<typeof import("@/lib/api/client")>(),api:vi.fn()}));
vi.mock("@/lib/api",()=>({loadCurrentUser:vi.fn()}));
const actor={id:randomUUID(),email:"scanner@fixture.invalid",roles:["STAFF"]};
const showtimeId=randomUUID(),gateId=randomUUID(),deviceId="fixture-device-1";
const mocked=vi.mocked(api);
function scan(overrides:Partial<PendingScan>={}):PendingScan{
  const id=randomUUID(),ticketId=randomUUID();
  return {id,requestId:id,showtimeId,gateId,deviceId,staffId:actor.id,ticketId:`${ticketQrInput({keyId:"fixture",showtimeId,ticketId})}.${"A".repeat(86)}`,createdAt:new Date().toISOString(),status:"pending",retryCount:0,mode:"offline_admission",...overrides};
}
function ack(s:PendingScan,status="synced"){return {scanId:s.requestId,ticketCode:parseTicketQr(s.ticketId)!.ticketId,status};}
function reply(value:unknown){mocked.mockImplementation(async(_path,decode)=>decode(value));}
beforeEach(()=>{vi.clearAllMocks();_resetMemoryQueueForTesting();_setMockServerReachableForTesting(null);markServerOnline();vi.mocked(loadCurrentUser).mockResolvedValue(actor);});
describe("S35/S37 durable batch ACK protocol",()=>{
 it("empty queue is online with zero pending",async()=>{expect((await syncPendingScans({checkServerBeforeSync:false})).remainingCount).toBe(0);expect(getCurrentNetworkStatus().isOnline).toBe(true);expect(mocked).not.toHaveBeenCalled();});
 it("keeps counter until matching v2 ACK, then marks only that record synced",async()=>{
  const s=scan();await addPendingScan(s);let resolve!:(v:unknown)=>void;
  mocked.mockImplementation(async(_path,decode)=>decode(await new Promise(r=>{resolve=r;})));
  const work=syncPendingScans({checkServerBeforeSync:false});await vi.waitFor(()=>expect(mocked).toHaveBeenCalled());
  expect(await getPendingScanCount()).toBe(1);expect(isSyncing()).toBe(true);
  resolve({version:2,results:[ack(s)]});expect((await work).remainingCount).toBe(0);
  expect(mocked.mock.calls[0][0]).toBe("/scanner/sync-scans");expect(isSyncing()).toBe(false);
 });
 it("maps stable scanId to local record even when legacy local id differs",async()=>{const s=scan({id:"legacy-local-id",requestId:randomUUID()});await addPendingScan(s);reply({version:2,results:[ack(s)]});expect((await syncPendingScans({checkServerBeforeSync:false})).syncedCount).toBe(1);});
 it("sends41scans as40+1 while retaining original timestamp, gate and device",async()=>{
  const scans=Array.from({length:41},()=>scan());for(const s of scans)await addPendingScan(s);
  mocked.mockImplementation(async(_p,decode,options)=>{const body=options!.body as {scans:{scanId:string;ticketCode:string}[]};return decode({version:2,results:body.scans.map(s=>({...s,status:"synced"}))});});
  expect((await syncPendingScans({checkServerBeforeSync:false})).remainingCount).toBe(0);expect(mocked).toHaveBeenCalledTimes(2);
  const body=mocked.mock.calls[0][2]!.body as {scans:Record<string,unknown>[]};expect(body.scans).toHaveLength(40);expect(body.scans[0]).toMatchObject({scanId:scans[0].requestId,gateId,deviceId,scannedAt:scans[0].createdAt,mode:"offline_admission"});
 });
 it.each([401,403,400,409,429,500,503,0])("retains queue and same UUID on HTTP%s without durable ACK",async status=>{const s=scan();await addPendingScan(s);mocked.mockRejectedValue(new ApiError("fixture",status,"FIXTURE"));const r=await syncPendingScans({checkServerBeforeSync:false});expect(r.remainingCount).toBe(1);expect((await getPendingScans())[0].requestId).toBe(s.requestId);expect((await getPendingScans())[0].status).toBe("pending");});
 it.each(["wrong-version","unknown-id","duplicate","wrong-ticket","legacy-success"])("rejects invalid %s ACK and never drops data",async kind=>{
   const s=scan();await addPendingScan(s);let value:unknown={version:2,results:[ack(s)]};
   if(kind==="wrong-version")value={version:1,results:[ack(s)]};if(kind==="unknown-id")value={version:2,results:[{...ack(s),scanId:randomUUID()}]};if(kind==="duplicate")value={version:2,results:[ack(s),ack(s)]};if(kind==="wrong-ticket")value={version:2,results:[{...ack(s),ticketCode:randomUUID()}]};if(kind==="legacy-success")value={success:true};
   reply(value);expect((await syncPendingScans({checkServerBeforeSync:false})).remainingCount).toBe(1);
 });
 it("partial ACK processes confirmed item only and retains remaining scan",async()=>{const a=scan(),b=scan();await addPendingScan(a);await addPendingScan(b);reply({version:2,results:[ack(a)]});const r=await syncPendingScans({checkServerBeforeSync:false});expect(r.remainingCount).toBe(1);expect((await getPendingScans())[0].id).toBe(b.id);});
 it.each(["conflict","rejected"])("accepts durable %s ACK for report followup",async status=>{const s=scan();await addPendingScan(s);reply({version:2,results:[ack(s,status)]});const r=await syncPendingScans({checkServerBeforeSync:false});expect(r.remainingCount).toBe(0);expect(r.failedCount).toBe(1);});
 it("does not send another staff member's queue or unsigned legacy QR",async()=>{await addPendingScan(scan({staffId:randomUUID()}));await addPendingScan(scan({ticketId:"TK-legacy"}));const r=await syncPendingScans({checkServerBeforeSync:false});expect(r.remainingCount).toBe(2);expect(mocked).not.toHaveBeenCalled();});
 it("requires a current STAFF identity",async()=>{await addPendingScan(scan());vi.mocked(loadCurrentUser).mockResolvedValue({...actor,roles:["BUYER"]});expect((await syncPendingScans({checkServerBeforeSync:false})).remainingCount).toBe(1);expect(mocked).not.toHaveBeenCalled();});
 it("prevents overlapping synchronization runs",async()=>{const s=scan();await addPendingScan(s);let resolve!:(v:unknown)=>void;mocked.mockImplementation(async(_p,decode)=>decode(await new Promise(r=>{resolve=r;})));const first=syncPendingScans({checkServerBeforeSync:false});await vi.waitFor(()=>expect(mocked).toHaveBeenCalled());expect((await syncPendingScans({checkServerBeforeSync:false})).errors).toHaveLength(1);resolve({version:2,results:[ack(s)]});await first;expect(mocked).toHaveBeenCalledOnce();});
 it("notifies subscribers from durable count",async()=>{let count=0;const off=subscribePendingCount(n=>{count=n;});await addPendingScan(scan());expect(count).toBe(1);off();});
});
