async (page) => {
 const root=__ROOT__; const password=__PASSWORD__; const base='http://localhost:3000'; const dir=root+'/evidence/stitch-correction/20261004/before/'; const publicId='c0100401-0000-4000-8000-000000000001';
 const shot=async name=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:dir+name+'.png',fullPage:true});};
 await page.context().clearCookies();
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:width===1280?900:844});
  await page.goto(base);await page.getByRole('link',{name:'Xem chi tiết →'}).first().waitFor();await shot('catalog-'+width);
  await page.goto(base+'/shows/'+publicId);await page.getByRole('link',{name:'Chọn ghế →'}).waitFor();await shot('detail-'+width);
  await page.goto(base+'/login?returnTo='+encodeURIComponent('/shows/'+publicId+'/seats'));await page.getByLabel('Email / Tên đăng nhập').waitFor();await shot('login-'+width);
 }
 await page.getByLabel('Email / Tên đăng nhập').fill('design-buyer@example.invalid');await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL('**/seats');
 for(const width of [1280,390]){await page.setViewportSize({width,height:width===1280?900:844});await page.goto(base+'/shows/'+publicId+'/seats');await page.locator('canvas[data-rendered="2000"]').waitFor();await page.locator('canvas').press('Enter');await shot('draft-'+width);}
 await page.context().clearCookies();
 const auth=await page.request.post(base+'/api/auth/login',{data:{email:'design-organizer@example.invalid',password}});if(!auth.ok())throw Error('Before login failed');
 const created=await page.request.post(base+'/api/events/c0100400-0000-4000-8000-000000000001/showtimes',{data:{startTime:'2026-10-17T12:30:00Z'}});if(!created.ok())throw Error('Before show create failed');const id=(await created.json()).id;
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:width===1280?900:844});
  await page.goto(base+'/showtimes/'+id+'/import');await page.getByLabel('Tệp JSON').waitFor();await page.getByLabel('Tệp JSON').setInputFiles(root+'/fixtures/seat-map-invalid.json');await page.locator('[data-slot=alert]').waitFor();await shot('import-error-'+width);
  await page.getByLabel('Tệp JSON').setInputFiles(root+'/fixtures/seat-map-2000.json');await page.locator('canvas[data-rendered="2000"]').waitFor();await shot('import-'+width);
 }
 await page.getByRole('button',{name:'Xác nhận nạp sơ đồ'}).click();await page.getByText('Đã nạp sơ đồ thành công.',{exact:true}).waitFor();
 for(const width of [1280,390]){await page.setViewportSize({width,height:width===1280?900:844});await page.goto(base+'/showtimes/'+id+'/prices');await page.getByLabel('VIP · VND').waitFor();await page.getByLabel('VIP · VND').fill('-1');await shot('prices-error-'+width);}
 const owned=await (await page.request.get(base+'/api/showtimes/'+id+'/manage')).json();await page.request.patch(base+'/api/showtimes/'+id+'/prices',{data:{prices:owned.categories.map(c=>({id:c.id,price:c.name==='VIP'?1200000:c.name==='Tiêu chuẩn'?650000:350000}))}});
 for(const width of [1280,390]){await page.setViewportSize({width,height:width===1280?900:844});for(const mode of ['manage','prices','map']){await page.goto(base+'/showtimes/'+id+'/'+mode);await page.getByRole('link',{name:'Nạp sơ đồ JSON',exact:true}).waitFor();if(mode!=='manage')await page.locator('canvas[data-rendered="2000"]').waitFor();await shot(mode+'-'+width);}}
 await page.setViewportSize({width:390,height:844});
 const pattern='**/api/showtimes';await page.route(pattern,async route=>{await new Promise(r=>setTimeout(r,1500));await route.fulfill({json:{items:[],nextCursor:null}});});await page.goto(base);await page.getByLabel('Đang tải danh sách').waitFor();await shot('loading-390');await page.getByRole('heading',{name:'Không tìm thấy sự kiện'}).waitFor();await shot('empty-390');await page.unroute(pattern);await page.route(pattern,r=>r.abort());await page.goto(base);await page.locator('[data-slot=alert]').waitFor();await shot('error-390');await page.unroute(pattern);
 return {date:new Date().toISOString(),showtimeId:id,catalogRows:6,viewport:[1280,390],syntheticDatabase:'stitch_fidelity',beforeBuild:true};
}
