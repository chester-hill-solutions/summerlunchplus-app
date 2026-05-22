update public.sign_up_terms
set is_active = false,
    updated_at = now()
where is_active = true;

insert into public.sign_up_terms (slug, title, content, version, is_active)
values (
  'default',
  'Privacy Policy',
  $$At summerlunch+, we are committed to protecting the privacy and personal information of children, families, educators, volunteers, and website visitors. This Privacy Policy explains how we collect, use, store, and protect information through our programs and website.

Information We Collect
We may collect the following types of information:
Parent or guardian names
Email addresses
Phone numbers
Child participant information
Program registration details
Feedback or survey responses

How We Use Information
Operate and manage nutrition education programs
Communicate with families and participants
Improve educational materials and services
Evaluate program effectiveness
Maintain website security and performance
Share program evaluation data with partners and donors

Children’s Privacy
Protecting children’s privacy is a core priority for summerlunch+. We collect children’s personal information only when necessary for program participation and evaluation purposes with appropriate parent or guardian consent.

Consent
Where required, we obtain consent from parents or legal guardians before collecting or using a child’s personal information and or photos shared with us. This is to be completed in our program registration form.

Data Security
We use administrative, technical, and physical safeguards to protect personal information from unauthorized access, disclosure, misuse, or loss. However, no online system can guarantee complete security.

Data Retention
We retain personal information only for as long as necessary to fulfill program, operational, legal, or reporting purposes. Information that is no longer required is securely deleted or anonymized.

Third-Party Links
Our website may contain links to external websites. summerlunch+ is not responsible for the privacy practices or content of third-party websites.

Photo, Media, and User Content
Participants, parents, guardians, educators, or volunteers may choose to upload photos, recipes, or other educational materials through summerlunch+ programs or website activities.

By submitting content, users confirm that:
they have the right and permission to share the content,
the content does not violate the privacy or rights of others,
and the content is appropriate, respectful, and related to summerlunch+ program

Examples of acceptable content may include:
recipe photos
educational activity photos
nutrition projects
or other materials specifically requested by the summerlunch+ team.

summerlunch+ reserves the right to remove any content that is considered inappropriate, unsafe, unrelated to program activities, offensive, or inconsistent with our mission and community standards.

Consent for Photos and Social Media
summerlunch+ will not publicly post or share identifiable photos or videos of children on social media, websites, promotional materials, or public communications unless explicit consent has been provided by a parent or legal guardian through an authorized consent form. Parents and guardians may withdraw media consent at any time by contacting summerlunch+.

Protection of Children’s Images
We take reasonable steps to minimize privacy risks associated with children’s images and media. Whenever possible, we avoid:
sharing full names alongside photos,
sharing sensitive personal information,
or using images in ways that could compromise a child’s safety, dignity, or privacy.

Changes to This Privacy Policy
We may update this Privacy Policy from time to time. Updated versions will be posted on this page with a revised effective date.$$,
  4,
  true
)
on conflict (slug) do update
set title = excluded.title,
    content = excluded.content,
    version = excluded.version,
    is_active = true,
    updated_at = now();
