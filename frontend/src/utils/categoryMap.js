export const categorySlugMap = {
  'ia': 'ia', 'ai': 'ia', 'artificial intelligence': 'ia', 'inteligência artificial': 'ia',
  'security': 'ciberseguranca', 'ciberseguranca': 'ciberseguranca', 'cybersecurity': 'ciberseguranca', 'segurança': 'ciberseguranca', 'infosec': 'ciberseguranca', 'hacker': 'ciberseguranca',
  'web': 'desenvolvimento', 'desenvolvimento': 'desenvolvimento', 'tecnologia': 'desenvolvimento', 'programming': 'desenvolvimento', 'software engineering': 'desenvolvimento', 'frontend': 'desenvolvimento', 'backend': 'desenvolvimento',
  'cloud': 'cloud', 'aws': 'cloud', 'gcp': 'cloud', 'azure': 'cloud', 'nuvem': 'cloud',
  'startups': 'startups', 'business': 'startups', 'negócios': 'startups', 'mercado': 'startups', 'saas': 'startups', 'funding': 'startups', 'empreendedorismo': 'startups',
  'hardware': 'hardware', 'chips': 'hardware', 'gpu': 'hardware', 'cpu': 'hardware', 'devices': 'hardware', 'apple': 'hardware', 'nvidia': 'hardware', 'intel': 'hardware',
  'mobile': 'mobile', 'android': 'mobile', 'ios': 'mobile', 'smartphone': 'mobile', 'apps': 'mobile',
  'devops': 'devops', 'sre': 'devops', 'ci/cd': 'devops', 'infraestrutura': 'devops', 'observabilidade': 'devops'
};

export const categoryNames = {
  'ia': 'Inteligência Artificial',
  'ciberseguranca': 'Cibersegurança',
  'desenvolvimento': 'Desenvolvimento',
  'cloud': 'Cloud Computing',
  'startups': 'Startups & Business',
  'hardware': 'Hardware & Infra',
  'mobile': 'Mobile',
  'devops': 'DevOps & SRE'
};

export const getCategorySlug = (category) => {
    if (!category) return null;
    const key = category.toLowerCase().trim();
    return categorySlugMap[key] || 'desenvolvimento';
};

export const getCategoryName = (slug) => {
    if (!slug) return 'Desenvolvimento';
    return categoryNames[slug.toLowerCase()] || slug.toUpperCase();
};
