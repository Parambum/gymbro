import type { Metadata } from "next";
import { LegalPage, Section, Callout } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — GymBro",
  description: "What GymBro collects, why, and what you can ask us to do with it.",
};

/**
 * NOT LEGAL ADVICE — see the note in terms/page.tsx.
 *
 * This one matters more than the terms do. Body weight and food intake are
 * health data under the DPDP Act 2023, the gym is a separate data fiduciary
 * with its own obligations, and getting the relationship between us and them
 * wrong is the kind of mistake that is expensive rather than embarrassing.
 * Have it reviewed before the first gym signs.
 *
 * Placeholders in ALL CAPS must be filled in before launch.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="14 October 2026">
      <p>
        This explains what GymBro collects, why, who can see it, and what you can
        ask us to do with it. It covers the app and the website.
      </p>

      <Callout title="What your gym can and cannot see">
        <p>
          Your gym licenses GymBro, but that does not give it a window into your
          account. Gym staff do not see your food logs, your body weight, or your
          training history unless you explicitly share them. What a gym receives
          is limited to whether an account it issued is active.
        </p>
        <p>If anyone at your gym tells you otherwise, write to us.</p>
      </Callout>

      <Section n={1} title="What we collect">
        <p>
          <strong className="text-ink">Account:</strong> name, email address, a
          bcrypt hash of your password — never the password itself — and, if you
          sign in with Google, the profile Google returns.
        </p>
        <p>
          <strong className="text-ink">Health and fitness:</strong> body weight
          and its history, height, age, sex, activity level, goals, training
          sessions with exercises, weights and repetitions, food and water logs,
          and the calorie and macro targets calculated from them.
        </p>
        <p>
          <strong className="text-ink">Photographs:</strong> only if you use
          photo logging. A meal photograph is sent for analysis, used to produce
          an editable estimate, and is not retained afterwards.
        </p>
        <p>
          <strong className="text-ink">Technical:</strong> ordinary server logs,
          including IP address, needed to run the service and to rate-limit
          sign-in attempts.
        </p>
        <p>
          We do not collect contacts, precise background location, or advertising
          identifiers, and GymBro carries no advertising or third-party tracking.
        </p>
      </Section>

      <Section n={2} title="Why we collect it">
        <p>
          To run the features you use: to calculate targets, to show progress, to
          keep you signed in, to send reminders you have asked for, and to keep
          the service secure. We process it on the basis of your consent, which
          you can withdraw by deleting your account.
        </p>
        <p>
          We do not sell personal data. We do not use your logs to train machine
          learning models.
        </p>
      </Section>

      <Section n={3} title="Who it is shared with">
        <p>
          Only the processors needed to operate GymBro: MongoDB Atlas for the
          database and Vercel for hosting, both holding data in India where we
          can configure it; and, where you use AI features, the model provider
          that returns the estimate. Each is bound to use the data only to
          provide that service.
        </p>
        <p>We will disclose data if required by law, and will tell you unless prohibited.</p>
      </Section>

      <Section n={4} title="How long it is kept">
        <p>
          Your logs are kept while your account exists, because a tracker without
          history is not a tracker. Deleting your account removes your personal
          data within 30 days, except anything we must keep by law. Meal
          photographs are not retained once analysed. Server logs are kept for 30
          days.
        </p>
      </Section>

      <Section n={5} title="Security">
        <p>
          Passwords are stored only as bcrypt hashes. All traffic is encrypted in
          transit. Sign-in attempts are rate-limited. Access to the production
          database is restricted and credentials are rotated.
        </p>
        <p>
          No service is perfectly secure. If a breach affects you, we will notify
          you and the Data Protection Board as the DPDP Act requires.
        </p>
      </Section>

      <Section n={6} title="Your rights">
        <p>
          You can ask us to show you the data we hold, correct it, delete it, or
          provide a copy you can take elsewhere, and you can withdraw consent.
          Write to COMPANY_EMAIL and we will respond within 30 days. If you are
          not satisfied, you may complain to the Data Protection Board of India.
        </p>
      </Section>

      <Section n={7} title="Children">
        <p>
          GymBro is not intended for children under 13, and we do not knowingly
          collect their data. Between 13 and 18, a parent or guardian must
          consent and supervise. Tell us at COMPANY_EMAIL if a child has given us
          data and we will delete it.
        </p>
      </Section>

      <Section n={8} title="Changes and contact">
        <p>
          Material changes will be notified in the app or by email at least 14
          days before they take effect.
        </p>
        <p>
          The data fiduciary is COMPANY_LEGAL_NAME, COMPANY_ADDRESS. Privacy
          questions and rights requests go to COMPANY_EMAIL.
        </p>
      </Section>
    </LegalPage>
  );
}
