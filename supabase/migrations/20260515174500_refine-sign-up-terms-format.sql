insert into public.sign_up_terms (slug, title, content, version, is_active)
values (
  'default',
  'Summerlunch+ Data Privacy Principles for Children''s Nutrition Education Programs',
  $$Purpose

At Summerlunch+, we are committed to protecting the privacy, safety, and dignity of children
and their families. These principles guide how we handle data in our nutrition education
programs while supporting responsible program delivery and evaluation.

1. Child-Centered Best Interests

We ensure that all data practices prioritize the best interests of the child. We only collect and
use data in ways that support children’s learning, health, and well-being, and avoid any
practices that could harm or stigmatize them.

2. Data Minimization and Purpose Limitation

We only collect data that is directly relevant and necessary for clearly defined educational and
evaluation purposes. We do not collect sensitive personal information unless it is essential and
justified, and we do not use data beyond its original purpose without renewed consent.

3. Informed Consent and Assent

We only collect data after obtaining informed consent from parents or legal guardians, along
with age-appropriate assent from children. We provide clear, accessible explanations of what
data is collected, why it is needed, how it will be used, and with whom it may be shared.

4. Transparency and Accountability

We are transparent about our data practices and provide plain-language privacy information to
families. We maintain clear accountability through designated data stewards and documented
data governance policies.

5. Privacy by Design and Default

We build privacy protections into our programs from the outset. By default, we only collect and
retain the minimum amount of personal data necessary, ensuring that information is not shared
unless required and authorized.

6. De-identification and Anonymization

We only collect identifiable data when necessary. Whenever possible, we use aggregated or
de-identified data for analysis, reporting, and knowledge sharing to reduce the risk of
re-identification.

7. Limited Retention and Secure Disposal

We only collect data for as long as necessary to fulfill program purposes or legal obligations.
We establish clear timelines for secure deletion or anonymization of personal data.

8. Third-Party Safeguards

We do not share data. We prohibit unauthorized data sharing or commercial use of children’s
data.

9. Rights of Access and Correction

We respect the rights of parents and guardians to access, review, and request corrections or
deletion of their child’s data, in accordance with applicable laws.

Implementation Commitment

At Summerlunch+, we commit to ongoing staff training, regular review of our data practices, and
continuous improvement to ensure we uphold the highest standards of children’s data privacy.$$,
  3,
  true
)
on conflict (slug) do update
set title = excluded.title,
    content = excluded.content,
    version = excluded.version,
    is_active = true,
    updated_at = now();
