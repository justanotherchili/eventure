import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { clerkClient, WebhookEvent } from '@clerk/nextjs/server'
import { createUser } from '@/lib/actions/user.actions'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local')
  }

  const headerPayload = headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err)
    return new Response('Error occured', {
      status: 400,
    })
  }

  const { id } = evt.data
  const eventType = evt.type

  if (eventType === 'user.created') {
    const { email_addresses, image_url, first_name, last_name, username } = evt.data;

    // Safely handle email_addresses array
    const email = email_addresses.length > 0 ? email_addresses[0].email_address : null;
    if (!email) {
      return NextResponse.json({ message: 'No email found for user' }, { status: 400 });
    }

    const user = {
      clerkId: id,
      email: email,
      username: username ?? 'anonymous', // Safely handle username
      firstName: first_name,
      lastName: last_name,
      photo: image_url,
    }

    let newUser;
    try {
      newUser = await createUser(user);
    } catch (err) {
      console.error('Error creating user:', err);
      return NextResponse.json({ message: 'Error creating user' }, { status: 500 });
    }

    if (!newUser) {
      console.error('User creation failed.');
      return NextResponse.json({ message: 'User creation failed' }, { status: 500 });
    }

    await clerkClient.users.updateUserMetadata(id!, {
      publicMetadata: {
        userId: newUser._id
      }
    })

    return NextResponse.json({ message: 'OK', user: newUser })
  }

  return new Response('', { status: 200 })
}