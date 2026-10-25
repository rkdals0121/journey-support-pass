import {serviceRequestHistory} from "@/lib/service-requests";
import {getDb} from "@/lib/db";
import {currentSession,json} from "@/lib/session-server";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const now=new Date();return json(await serviceRequestHistory(await getDb(),await currentSession(now),(await params).id,now));}
