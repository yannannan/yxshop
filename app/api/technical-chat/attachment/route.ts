import { chatActor, chatAttachment, chatFailure } from '@/lib/consultation-chat';
export async function GET(request: Request) {
  try { return await chatAttachment(request,await chatActor(request)); }
  catch (error) { return chatFailure(error); }
}
