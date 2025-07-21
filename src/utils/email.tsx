import sgMail from '@sendgrid/mail';

const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) throw new Error('Missing SENDGRID_API_KEY');
sgMail.setApiKey(apiKey);

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  filename: string;
  fileBuffer: Buffer;
}

export async function sendEmailWithAttachment({ to, subject, text, filename, fileBuffer }: EmailOptions) {
  const msg = {
    to,
    from: {
      email: 'admin@magicsale.co.il',
      name: 'MagicSale',
    },
    subject,
    text,
    attachments: [
      {
        content: fileBuffer.toString('base64'),
        filename,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        disposition: 'attachment',
      },
    ],
  };

  await sgMail.send(msg);
}
