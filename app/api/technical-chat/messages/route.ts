import { chatActor, chatFailure, resolveChatConsultation, saveChatMessage } from '@/lib/consultation-chat';
import { readChatRequest, requireChatOrigin } from '@/lib/consultation-message.mjs';
export async function POST(request: Request) {
  try {
    requireChatOrigin(request);
    const actor=await chatActor(request), input=await readChatRequest(request);
    const consultationId=await resolveChatConsultation(actor,input);
    return Response.json(await saveChatMessage(actor,consultationId,input.text,input.file),{headers:{'Cache-Control':'no-store'}});
  } catch (error) { return chatFailure(error); }
}
