export interface Stop {
  invoice: string; invoiceNo: string; partyName: string; amount: number; boxes: number;
  status: 'pending' | 'delivered' | 'returned'; collectedAmount: number; remark: string; deliveredAt?: string;
}

export interface DeliveryRun {
  _id: string; number: string; date: string; route?: string; routeName: string; deliveryPerson?: string; deliveryPersonName: string;
  vehicleNo: string; stops: Stop[]; status: 'open' | 'dispatched' | 'closed'; narration: string; createdAt: string;
}

export const runTotals = (r: Pick<DeliveryRun, 'stops'>) => ({
  bills: r.stops.length,
  boxes: r.stops.reduce((s, x) => s + (x.boxes || 0), 0),
  amount: r.stops.reduce((s, x) => s + (x.amount || 0), 0),
  collected: r.stops.reduce((s, x) => s + (x.collectedAmount || 0), 0),
  delivered: r.stops.filter((x) => x.status === 'delivered').length,
  returned: r.stops.filter((x) => x.status === 'returned').length,
  pending: r.stops.filter((x) => x.status === 'pending').length,
});
