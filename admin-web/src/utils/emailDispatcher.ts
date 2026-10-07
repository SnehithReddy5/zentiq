import { db } from '../firebase';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';

export interface EmailDispatchOptions {
  to: string | string[];
  subject: string;
  body: string;
  isBcc?: boolean;
}

export interface SystemCommunicationSettings {
  communicationEmail: string;
  senderName: string;
  sendMethod: 'GMAIL' | 'MAILTO' | 'RESEND';
  resendApiKey?: string;
}

export const getCommunicationSettings = async (): Promise<SystemCommunicationSettings> => {
  try {
    const snap = await getDoc(doc(db, 'system', 'settings'));
    if (snap.exists()) {
      const data = snap.data();
      return {
        communicationEmail: data.communicationEmail || 'support@zentiq.com',
        senderName: data.senderName || 'Zentiq POS Platform',
        sendMethod: data.sendMethod || 'GMAIL',
        resendApiKey: data.resendApiKey || '',
      };
    }
  } catch (err) {
    console.warn('Could not fetch settings:', err);
  }
  return {
    communicationEmail: 'support@zentiq.com',
    senderName: 'Zentiq POS Platform',
    sendMethod: 'GMAIL',
    resendApiKey: '',
  };
};

export const dispatchSystemEmail = async (
  options: EmailDispatchOptions,
  customSettings?: SystemCommunicationSettings
): Promise<{ success: boolean; method: string; message?: string }> => {
  const settings = customSettings || (await getCommunicationSettings());
  const recipientList = Array.isArray(options.to) ? options.to : [options.to];
  const toStr = recipientList.join(',');

  // 1. Always write an audit record to Firestore `mail` collection
  try {
    await addDoc(collection(db, 'mail'), {
      to: options.isBcc ? [] : recipientList,
      bcc: options.isBcc ? recipientList : [],
      from: `${settings.senderName} <${settings.communicationEmail}>`,
      replyTo: settings.communicationEmail,
      message: {
        subject: options.subject,
        text: options.body,
      },
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Mail logging skipped:', err);
  }

  // 2. Direct background sending via Resend if configured
  if (settings.resendApiKey) {
    try {
      const endpoint = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? '/api/resend/emails'
        : 'https://api.resend.com/emails';

      // Resend requires onboarding@resend.dev unless a custom domain is verified
      const isPublicProvider = settings.communicationEmail.includes('@gmail.com') ||
        settings.communicationEmail.includes('@yahoo.com') ||
        settings.communicationEmail.includes('@outlook.com') ||
        settings.communicationEmail.includes('@hotmail.com');

      const senderFrom = isPublicProvider
        ? `${settings.senderName || 'Zentiq POS'} <onboarding@resend.dev>`
        : `${settings.senderName || 'Zentiq POS'} <${settings.communicationEmail}>`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.resendApiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: senderFrom,
          to: options.isBcc ? [settings.communicationEmail] : recipientList,
          bcc: options.isBcc ? recipientList : undefined,
          reply_to: settings.communicationEmail,
          subject: options.subject,
          text: options.body,
        }),
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(responseData.message || responseData.error || 'Resend API rejected the request');
      }

      alert(`✓ Success! Email dispatched in the background to ${toStr} from ${settings.communicationEmail}`);
      return { success: true, method: 'RESEND', message: 'Email sent in background' };
    } catch (err: any) {
      console.error('Direct background Resend failed:', err);
      const shouldFallback = window.confirm(
        `Background sending error from Resend: \n\n"${err.message}"\n\nWould you like to open Gmail Compose as a fallback to send it now?`
      );
      if (!shouldFallback) {
        return { success: false, method: 'RESEND', message: err.message };
      }
    }
  }

  // 3. Gmail Web Compose with sender communicationEmail preselected via authuser
  if (settings.sendMethod === 'GMAIL' || !settings.sendMethod) {
    let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(options.subject)}&body=${encodeURIComponent(options.body)}&authuser=${encodeURIComponent(settings.communicationEmail)}`;
    if (options.isBcc) {
      gmailUrl += `&bcc=${encodeURIComponent(toStr)}`;
    } else {
      gmailUrl += `&to=${encodeURIComponent(toStr)}`;
    }
    window.open(gmailUrl, '_blank');
    return { success: true, method: 'GMAIL', message: 'Opened in Gmail using ' + settings.communicationEmail };
  }

  // 4. Default System Mailto
  let mailtoUrl = `mailto:${options.isBcc ? '' : encodeURIComponent(toStr)}?subject=${encodeURIComponent(options.subject)}&body=${encodeURIComponent(options.body)}`;
  if (options.isBcc) {
    mailtoUrl += `&bcc=${encodeURIComponent(toStr)}`;
  }
  window.open(mailtoUrl, '_blank');
  return { success: true, method: 'MAILTO', message: 'Opened in default mail app' };
};
