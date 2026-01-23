import { Controller, Get, Route } from "@tsoa/runtime";

@Route("health")
export class HealthController extends Controller {
	@Get()
	public async healthCheckpoint() {
		this.setStatus(200);
		return { status: "ok" };
	}
}
