import type { Metadata } from "next";
import { LegalPage, Section, Callout } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use — GymBro",
  description: "The terms you agree to when you use GymBro.",
};

/**
 * NOT LEGAL ADVICE. This is a starting draft written to cover the things this
 * particular app actually does — set calorie targets, estimate food from
 * photographs, hold body-weight history, and be licensed to gyms rather than
 * sold to individuals. It needs review by an Indian lawyer before the first
 * paying gym signs anything, in particular on the DPDP Act 2023, on consumer
 * protection, and on the liability limits in sections 7 and 8, which are the
 * clauses most likely to be read down by a court.
 *
 * Placeholders in ALL CAPS must be filled in before launch.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="14 October 2026">
      <p>
        GymBro is a training and nutrition tracker licensed to gyms and fitness
        centres, who make it available to their members. These terms apply to
        you as someone using the app. Your gym has a separate agreement with us,
        and nothing here changes what you have agreed with them.
      </p>
      <p>
        By creating an account or using GymBro, you accept these terms. If you
        do not accept them, do not use the app.
      </p>

      <Callout title="GymBro is not medical advice">
        <p>
          Every number in this app — calorie targets, macro splits, estimated
          energy expenditure, suggested weights and progressions — is an
          estimate produced by a formula or a model from the information you
          typed in. None of it is a medical opinion, a diagnosis, a prescription
          or a treatment plan, and none of it has been reviewed for you
          personally by a doctor or a registered dietitian.
        </p>
        <p>
          Talk to a qualified professional before changing what you eat or how
          you train, and especially if you are pregnant, under 18, managing a
          medical condition such as diabetes, kidney or heart disease, taking
          medication affected by diet, or have any history of disordered eating.
          Stop and seek medical help if you feel unwell while training.
        </p>
      </Callout>

      <Section n={1} title="Who may use GymBro">
        <p>
          You need an account issued through a gym that licenses GymBro. You must
          be 18 or older, or 13 or older with a parent or guardian&apos;s consent
          and supervision. One account is for one person — do not share your
          login, including with a trainer. Keep your password to yourself, and
          tell us at COMPANY_EMAIL if you think someone else has it.
        </p>
      </Section>

      <Section n={2} title="What we provide">
        <p>
          A tracker for training sessions, body weight, food and water, with
          calculated targets and progress views. We aim to keep it available but
          do not promise uninterrupted service; we may change, suspend or
          withdraw features, and will give your gym reasonable notice of
          material changes.
        </p>
      </Section>

      <Section n={3} title="Food data and estimates">
        <p>
          Nutrition figures come from the USDA FoodData Central database and from
          Open Food Facts, a crowd-sourced database of packaged products. Entries
          from Open Food Facts are transcribed by volunteers from photographs of
          labels and are shown as unverified in the app. They are usually right
          and occasionally wrong.
        </p>
        <p>
          Where the app estimates a meal from a photograph or a description, that
          estimate is a guess by a language model. It is labelled as an estimate,
          it is editable before you save it, and you should correct it. Do not
          rely on any figure in this app where being wrong would matter medically
          — check the packet.
        </p>
      </Section>

      <Section n={4} title="Your content">
        <p>
          Your logs, weights, custom foods and recipes remain yours. You grant us
          only the licence needed to store them, show them back to you, and
          operate the service. We do not sell your data, and we do not use your
          personal logs to train models. See the{" "}
          <a href="/privacy" className="text-accent underline underline-offset-2">
            Privacy Policy
          </a>
          .
        </p>
      </Section>

      <Section n={5} title="Acceptable use">
        <p>You agree not to:</p>
        <ul className="ml-5 list-disc space-y-1.5 marker:text-faint">
          <li>access another member&apos;s data, or try to</li>
          <li>probe, scan or test the security of the service without our written permission</li>
          <li>scrape, bulk-export or resell the food database</li>
          <li>reverse engineer the app except where that right cannot lawfully be excluded</li>
          <li>upload anything unlawful, or anyone else&apos;s personal information</li>
          <li>use the service to give medical or dietary advice to others as though it were professional advice</li>
        </ul>
        <p>
          We may suspend an account that breaches this section, and will tell the
          gym that issued it.
        </p>
      </Section>

      <Section n={6} title="Accounts and ending access">
        <p>
          Your access depends on your gym&apos;s licence. If that licence ends, or
          your membership does, your access ends too. You can ask us to delete
          your account at any time at COMPANY_EMAIL, and we will do so within 30
          days except where we must keep records by law.
        </p>
      </Section>

      <Section n={7} title="Liability">
        <p>
          To the fullest extent the law allows, GymBro is provided as-is, and we
          are not liable for indirect or consequential loss, for lost data where
          you have not kept your own copy, or for any outcome of acting on an
          estimate the app has labelled as one. Our total liability to you is
          limited to the amount paid for your use of GymBro in the twelve months
          before the claim.
        </p>
        <p>
          Nothing in these terms excludes liability that cannot lawfully be
          excluded, including for death or personal injury caused by negligence,
          or for fraud.
        </p>
      </Section>

      <Section n={8} title="Changes">
        <p>
          We may update these terms. Material changes will be notified in the app
          or by email at least 14 days in advance. Continuing to use GymBro after
          that means you accept the new version.
        </p>
      </Section>

      <Section n={9} title="Governing law and contact">
        <p>
          These terms are governed by the laws of India, and the courts of
          COMPANY_CITY have exclusive jurisdiction.
        </p>
        <p>
          GymBro is operated by COMPANY_LEGAL_NAME, COMPANY_ADDRESS. Questions go
          to COMPANY_EMAIL.
        </p>
      </Section>
    </LegalPage>
  );
}
