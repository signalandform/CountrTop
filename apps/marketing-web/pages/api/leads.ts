import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

type LeadResponse = {
  ok: boolean;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeadResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { email, businessName } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ ok: false, error: 'Email is required' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ ok: false, error: 'Invalid email format' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { error } = await supabase
      .from('marketing_leads')
      .insert({
        email: email.toLowerCase().trim(),
        business_name: businessName?.trim() || null,
        source: 'website',
        created_at: new Date().toISOString()
      });

    if (error) {
      // Handle duplicate email gracefully
      if (error.code === '23505') {
        return res.status(200).json({ ok: true }); // Silently succeed for duplicates
      }
      console.error('Supabase error:', error);
      return res.status(500).json({ ok: false, error: 'Failed to save lead' });
    }

    // Optionally send notification email to admin
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'CountrTop <noreply@countrtop.com>',
            to: ['hello@countrtop.com'],
            subject: `New Waitlist Signup: ${businessName || email}`,
            html: `
              <h2>New Lead</h2>
              <p><strong>Email:</strong> ${email}</p>
              ${businessName ? `<p><strong>Business:</strong> ${businessName}</p>` : ''}
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            `
          })
        });
      } catch (emailErr) {
        // Don't fail the request if notification fails
        console.warn('Failed to send admin notification:', emailErr);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error saving lead:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
