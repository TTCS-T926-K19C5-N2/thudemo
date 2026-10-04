import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const url=new URL(process.env.DATABASE_URL??'');
if(url.hostname!=='127.0.0.1'||url.port!=='15432'||url.pathname!=='/sprint2_local') throw new Error('Only isolated Sprint2 database');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
const password=process.env.SPRINT2_DEMO_PASSWORD;
if(!password||password.length<12) throw new Error('Set SPRINT2_DEMO_PASSWORD (local fake account only)');
try{
  for(const roleName of ['ORGANIZER','BUYER']){
    const role=await db.role.upsert({where:{name:roleName},create:{name:roleName},update:{}});
    const email=`sprint2-${roleName.toLowerCase()}@demo.invalid`;
    await db.user.upsert({where:{email},update:{password:await argon2.hash(password),isEmailVerified:true},create:{email,password:await argon2.hash(password),isEmailVerified:true,userRoles:{create:{roleId:role.id}}}});
  }
  const login=await fetch('http://localhost:3001/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'sprint2-organizer@demo.invalid',password})});
  if(!login.ok) throw new Error('Demo login failed');
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const api=async(path,method='GET',body)=>{const res=await fetch(`http://localhost:3001${path}`,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!res.ok)throw new Error(`Fixture API failed: ${path} (${res.status})`);return res.json();};
  const existing=await api('/events/mine'); let event=existing.find(e=>e.name==='Đêm nhạc Tháng Mười - Giai điệu Mùa Thu');
  if(!event) event=await api('/events','POST',{name:'Đêm nhạc Tháng Mười - Giai điệu Mùa Thu',description:'Một đêm giao hưởng cùng những giai điệu mùa thu tại Nhà hát Ánh Dương.',location:'Nhà hát Ánh Dương, Quận 1, TP.HCM'});
  let detail=await api(`/events/${event.id}/manage`); let show=detail.showtimes[0];
  if(!show)show=await api(`/events/${event.id}/showtimes`,'POST',{startTime:new Date(Date.now()+7*86400000).toISOString()});
  let current=await api(`/showtimes/${show.id}/manage`);
  if(!current._count.seats){ await api(`/showtimes/${show.id}/seat-map`,'POST',JSON.parse(readFileSync(resolve('../../fixtures/seat-map-2000.json'),'utf8')));current=await api(`/showtimes/${show.id}/manage`);}
  if(current.categories.some(c=>c.price===null))await api(`/showtimes/${show.id}/prices`,'PATCH',{prices:current.categories.map(c=>({id:c.id,price:c.name==='VIP'?1200000:c.name==='Tiêu chuẩn'?650000:350000}))});
  if(current.status!=='ON_SALE')await api(`/showtimes/${show.id}/status`,'PATCH',{status:'ON_SALE'});
  writeFileSync(resolve('../../evidence/sprint2/20261004-local/demo-fixture.json'),JSON.stringify({eventId:event.id,showtimeId:show.id,accounts:['sprint2-organizer@demo.invalid','sprint2-buyer@demo.invalid'],fakeData:true},null,2));
  console.log(`Demo showtime: ${show.id}`);
}finally{await db.$disconnect();}
