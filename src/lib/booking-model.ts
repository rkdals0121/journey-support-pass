import type { FlightDto } from "./api/dto";

/** Only normalized itinerary data crosses into support registration. */
export interface BookingHandoff {
  mode: "demo";
  flight: FlightDto;
  context: string;
  expiresAt: string;
}
