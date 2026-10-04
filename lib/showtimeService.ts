export type ShowtimeStatus = 'nhap' | 'dang_ban' | 'da_dong';

export interface ShowtimeWithDetails {
  id: string;
  status: ShowtimeStatus;
  seatMapId: string | null; 
  seatCategories: { price: number | null }[]; 
}

export function changeShowtimeStatus(
  showtime: ShowtimeWithDetails,
  targetStatus: ShowtimeStatus
): ShowtimeWithDetails {
  
  if (showtime.status === 'nhap' && targetStatus === 'dang_ban') {
    if (!showtime.seatMapId) {
      throw new Error('Từ chối: Suất diễn chưa được thiết lập sơ đồ ghế.');
    }
    
    if (!showtime.seatCategories || showtime.seatCategories.length === 0) {
      throw new Error('Từ chối: Suất diễn chưa có hạng ghế nào.');
    }

    const hasUnpricedSeat = showtime.seatCategories.some(
      cat => cat.price === null || cat.price === undefined
    );
    if (hasUnpricedSeat) {
      throw new Error('Từ chối: Vẫn còn hạng ghế chưa được thiết lập giá.');
    }
  }

  return {
    ...showtime,
    status: targetStatus
  };
}