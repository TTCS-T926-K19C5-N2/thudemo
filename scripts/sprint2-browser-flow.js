async (page) => {
  await page.unrouteAll({behavior:"wait"});
  await page.context().clearCookies();
  const root = __TASK_ROOT__;
  const password = __DEMO_PASSWORD__;
  const evidence = root + '/evidence/sprint2/20261004-local/';
  const checks = [];
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(e.message));
  const require = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
  const shot = name => page.screenshot({ path: evidence + name + '.png', fullPage: true });
  await page.setViewportSize({width:1280,height:900});
  await page.goto('http://localhost:3000');
  await page.getByRole('link',{name:'Xem chi tiết →'}).first().waitFor();
  await shot('public-desktop');
  const detailLink = await page.getByRole('link',{name:'Xem chi tiết →'}).first().getAttribute('href');
  const publicId = detailLink.split('/').at(-1);
  await page.getByRole('link',{name:'Xem chi tiết →'}).first().click();
  await page.getByRole('link',{name:'Chọn ghế →'}).waitFor();
  await shot('detail-desktop');
  await page.getByRole('link',{name:'Chọn ghế →'}).click();
  await page.waitForURL('**/login?returnTo=*');
  require(new URL(page.url()).searchParams.get('returnTo')===`/shows/${publicId}/seats`,'Anonymous login returns to exact showtime; home to seats two clicks');
  await page.getByLabel('Email / Tên đăng nhập').fill('sprint2-buyer@demo.invalid');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  await shot('buyer-login-desktop');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await page.waitForURL(`**/shows/${publicId}/seats`);
  await page.locator('canvas[data-rendered="2000"]').waitFor();
  await page.locator('canvas').press('Enter');
  require(!(await page.getByRole('button',{name:'Giữ ghế',exact:true}).isEnabled()),'Hold remains disabled at K01 gate; draft selection works');
  await shot('buyer-draft-desktop');
  const renderSamples=[];
  for(let i=0;i<30;i++) {
    await page.goto(`http://localhost:3000/shows/${publicId}/seats`);
    await page.locator('canvas[data-rendered="2000"]').waitFor();
    renderSamples.push(await page.evaluate(()=>performance.getEntriesByName('seat-map-rendered')[0].startTime));
  }
  const sorted=[...renderSamples].sort((a,b)=>a-b); const renderP95=sorted[Math.ceil(sorted.length*.95)-1];
  require(renderP95<2000,'2000-seat production navigation-to-render p95 below 2 seconds (warm browser)');
  for(const width of [390,360,768]) {
    await page.setViewportSize({width,height:844});
    await page.goto(`http://localhost:3000/shows/${publicId}/seats`); await page.locator('canvas[data-rendered="2000"]').waitFor();
    require(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal page overflow '+width);
    await page.locator('canvas').click({position:{x:53,y:98}}); await page.getByRole('button',{name:'Phóng to'}).click();
    await shot('buyer-'+width);
    await page.goto('http://localhost:3000'); await page.getByRole('link',{name:'Xem chi tiết →'}).first().waitFor(); await shot('public-'+width);
  }
  // UI-only state fixtures. Removed before every real-data measurement/action.
  await page.setViewportSize({width:390,height:844});
  const catalogPattern = '**/api/showtimes';
  await page.route(catalogPattern, async route => { await new Promise(resolve=>setTimeout(resolve,1000)); await route.fulfill({json:{items:[],nextCursor:null}}); });
  await page.goto('http://localhost:3000');
  await page.getByLabel('Đang tải danh sách').waitFor(); await shot('ui-fixture-loading-390');
  await page.getByRole('heading',{name:'Không tìm thấy sự kiện'}).waitFor(); await shot('ui-fixture-empty-390');
  require(await page.getByRole('link',{name:'Xem chi tiết →'}).count()===0,'UI fixture empty does not invent demo data');
  await page.unroute(catalogPattern);
  await page.route(catalogPattern, route => route.abort());
  await page.goto('http://localhost:3000'); await page.locator('[data-slot=alert]').waitFor(); await shot('ui-fixture-error-390');
  require(await page.getByRole('button',{name:'Thử lại'}).isEnabled(),'Network error offers recovery without fake success');
  await page.unroute(catalogPattern); await page.getByRole('button',{name:'Thử lại'}).click(); await page.getByRole('link',{name:'Xem chi tiết →'}).first().waitFor();
  const seatPattern = `**/api/showtimes/${publicId}/seats`;
  await page.route(seatPattern, async route => { const response=await route.fetch(); const seats=await response.json(); seats[0].status='SOLD'; seats[1].status='HELD'; await route.fulfill({json:seats}); });
  await page.goto(`http://localhost:3000/shows/${publicId}/seats`); await page.locator('canvas[data-rendered="2000"]').waitFor();
  await page.locator('canvas').press('Enter'); await page.locator('canvas').press('ArrowRight'); await page.locator('canvas').press('Enter');
  require(await page.getByText('Chạm vào ghế trống để chọn.').isVisible(),'UI fixture SOLD and HELD cannot be selected by keyboard');
  await shot('ui-fixture-unavailable-390'); await page.unroute(seatPattern);
  await page.setViewportSize({width:1280,height:900});
  await page.goto('http://localhost:3000/login');
  await page.getByLabel('Địa chỉ Email').fill('sprint2-organizer@demo.invalid');
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Đăng Nhập Không Gian Vận Hành'}).click();
  await page.waitForURL('**/events');
  const mine=await (await page.request.get('http://localhost:3000/api/events/mine')).json();
  const event=mine.find(e=>e.name==='Đêm nhạc Tháng Mười · Dữ liệu giả');
  const response=await page.request.post(`http://localhost:3000/api/events/${event.id}/showtimes`,{data:{startTime:new Date(Date.now()+8*86400000).toISOString()}});
  require(response.ok(),'Create owned draft showtime through authenticated HTTP');
  const show=await response.json(); const id=show.id;
  await page.goto(`http://localhost:3000/showtimes/${id}/manage`); await page.getByRole('heading',{name:'Kiểm tra điều kiện mở bán'}).waitFor();
  require(!(await page.getByRole('button',{name:'Mở bán',exact:true}).isEnabled()),'No map disables opening with reason');
  await shot('manage-no-map-desktop');
  await page.goto(`http://localhost:3000/showtimes/${id}/import`); await page.getByLabel('Tệp JSON').waitFor();
  await page.getByLabel('Tệp JSON').setInputFiles(root+'/fixtures/seat-map-invalid.json');
  await page.locator('[data-slot=alert]').waitFor();
  require(!(await page.getByRole('button',{name:'Xác nhận nạp sơ đồ'}).isEnabled()),'Invalid JSON map lists errors and disables import');
  await shot('import-error-desktop');
  await page.getByLabel('Tệp JSON').setInputFiles(root+'/fixtures/seat-map-2000.json');
  await page.locator('canvas[data-rendered="2000"]').waitFor();
  const before=await (await page.request.get(`http://localhost:3000/api/showtimes/${id}/manage`)).json();
  require(before._count.seats===0,'Valid preview writes no seats');
  await shot('import-preview-desktop');
  await page.getByRole('button',{name:'Xác nhận nạp sơ đồ'}).click(); await page.getByText('Đã nạp sơ đồ thành công.',{exact:true}).waitFor();
  require((await (await page.request.get(`http://localhost:3000/api/showtimes/${id}/manage`)).json())._count.seats===2000,'UI imports 2000 seats into database');
  await page.goto(`http://localhost:3000/showtimes/${id}/prices`); await page.getByLabel('VIP · VND').waitFor();
  await page.getByLabel('VIP · VND').fill('-1'); require(!(await page.getByRole('button',{name:'Lưu giá'}).isEnabled()),'Negative price cannot submit'); await shot('price-error-desktop');
  await page.getByLabel('VIP · VND').fill('1200000'); await page.getByLabel('Tiêu chuẩn · VND').fill('650000'); await page.getByLabel('Ban công · VND').fill('350000');
  await page.getByRole('button',{name:'Lưu giá'}).click(); await page.getByText('Đã lưu giá. Sơ đồ đã cập nhật.',{exact:true}).waitFor();
  require((await page.locator('#seat-inspector').innerText()).includes('1.200.000'),'Saved price appears in inspector'); await shot('prices-desktop');
  await page.goto(`http://localhost:3000/showtimes/${id}/manage`); await page.getByRole('button',{name:'Mở bán',exact:true}).waitFor(); await page.getByRole('button',{name:'Mở bán',exact:true}).click(); await page.getByText('Đã mở bán.',{exact:true}).waitFor();
  require((await (await page.request.get(`http://localhost:3000/api/showtimes/${id}/manage`)).json()).status==='ON_SALE','UI opens sale with real persisted status'); await shot('manage-desktop');
  await page.getByRole('button',{name:'Đóng bán',exact:true}).click(); await page.getByText('Đã đóng bán.',{exact:true}).waitFor();
  require((await page.request.get(`http://localhost:3000/api/showtimes/${id}`)).status()===404,'Closed show detail returns informative non-sale response');
  await page.getByRole('button',{name:'Mở bán',exact:true}).click(); await page.getByText('Đã mở bán.',{exact:true}).waitFor();
  for(const width of [1280,390,360,768]) {
    await page.setViewportSize({width,height:900});
    for(const mode of ['manage','import','prices','map']) {
      await page.goto(`http://localhost:3000/showtimes/${id}/${mode}`); await page.getByRole('link',{name:'Nạp sơ đồ JSON',exact:true}).waitFor();
      if(mode==='map'||mode==='prices')await page.locator('canvas[data-rendered="2000"]').waitFor();
      require(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Organizer '+mode+' no overflow '+width);
      await shot(mode+'-'+width);
    }
  }
  require(consoleErrors.length===0,'No JavaScript runtime errors in exercised flows');
  return {date:new Date().toISOString(),mode:'production Next standalone/Nest build; Chrome emulation, not physical device',checks,renderSamples,renderP95,renderMeasurement:'navigation timeOrigin to first full canvas frame; warm browser assets; 30 successful samples',consoleErrors,showtimeId:id,uiFixtureStates:["loading","empty","network error","SOLD/HELD unselectable"],holdIntegrated:false,staging:false};
}
