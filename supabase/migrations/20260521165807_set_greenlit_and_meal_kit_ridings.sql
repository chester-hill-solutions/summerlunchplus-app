update public.federal_electoral_district
set whitelist = true
where name in (
  'Surrey Centre',
  'Winnipeg Centre',
  'Winnipeg North',
  'Kings—Hants',
  'Beaches—East York',
  'Don Valley West',
  'Scarborough Centre—Don Valley East',
  'Dufferin—Caledon',
  'Hamilton Centre',
  'Burlington North—Milton West',
  'Ottawa—Vanier—Gloucester',
  'Taiaiako''n—Parkdale—High Park',
  'Toronto Centre',
  'Whitby'
);

update public.federal_electoral_district
set meal_kit = true
where name in (
  'Don Valley West',
  'Scarborough Centre—Don Valley East'
);
