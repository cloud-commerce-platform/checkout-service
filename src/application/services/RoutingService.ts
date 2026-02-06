export class RoutingService {
	private partitionCount: number;

	constructor(partitionCount: number = 1) {
		this.partitionCount = partitionCount;
	}

	calculatePartition(orderId: string): number {
		const hash = this.fnv1aHash(orderId);
		return (hash % this.partitionCount) + 1;
	}

	private fnv1aHash(str: string): number {
		let hash = 0x811c9dc5;
		for (let i = 0; i < str.length; i++) {
			hash ^= str.charCodeAt(i);
			hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
		}
		return hash >>> 0;
	}
}
