// Curriculum from the La Concepcion College evaluation sheets.
// Key "Y.S" = year level . semester (1 = 1st sem, 2 = 2nd sem, 3 = summer).
// Entry "CODE" uses the shared dictionary D; "CODE|Title" gives its own title.
// Left out (not written exams): internships, practicums, OJT, course audits, bridging programs, pre-internship orientations.

const D: Record<string, string> = {
  'EDUC 101': 'The Child and Adolescent Learners and Learning Principles', 'EDUC 102': 'The Teaching Profession',
  'EDUC 103': 'The Teacher and the Community, School Culture and Organizational Leadership', 'EDUC 104': 'Foundation of Special and Inclusive Education',
  'EDUC 105': 'Facilitating Learner Centered Teaching', 'EDUC 106.1': 'Assessment of Learning 1', 'EDUC 106.2': 'Assessment of Learning 2',
  'EDUC 107.1': 'Technology for Teaching and Learning 1', 'EDUC 107.2': 'Technology for Teaching and Learning 2', 'EDUC 108': 'The Teacher and the School Curriculum',
  'EDUC 109': 'Building and Enhancing New Literacies Across the Curriculum', 'EDUC 190': 'Statistical Techniques in Educational Research', 'EDUC 200': 'Research in Education 2: Thesis',
  'FS 101': 'Field Study 1', 'FS 102': 'Field Study 2', 'PED 5A': 'Principles of Teaching 1', 'PED 5B': 'Principles of Teaching 2',
  'MST 1': 'Mathematics in the Modern World', 'MST 2': 'Science Technology and Society', 'AH 1': 'Purposive Communication', 'AH 2': 'Art Appreciation',
  'ELEC 1': 'Elective 1 (AH / MST / SSP)', 'ELEC 2': 'Elective 2 (AH / MST / SSP)', 'ELEC 3': 'Elective 3 (AH / MST / SSP)',
  'SSP 1': 'Understanding the Self', 'SSP 2': 'Readings in Philippine History', 'SSP 3': 'The Contemporary World', 'SSP 4': 'Ethics',
  'SSP 5': 'Introduction to Taxation per 1987 Philippine Constitution', 'RIZAL': 'Life and Works of Rizal', 'ENG 155': 'Business Communication',
  'PE 1': 'Physical Fitness and Gymnastics', 'PE 2': 'Rhythmic Activities', 'PE 3': 'Individual and Dual Sports', 'PE 4': 'Team Sports',
  'NSTP 1': 'Literacy Training Service I', 'NSTP 2': 'Literacy Training Service II', 'OM-TQM': 'Operations Management and TQM', 'STRAT': 'Strategic Management',
  'ACCT 99': 'Fundamentals of Accounting', 'ACCT 100': 'Financial Accounting and Reporting', 'ACCT 101': 'Conceptual Framework and Accounting Standards',
  'ACCT 102': 'Intermediate Accounting 1', 'ACCT 103': 'Intermediate Accounting 2', 'ACCT 104': 'Intermediate Accounting 3', 'ACCT 105': 'Cost Accounting and Control',
  'ACCT 106': 'Strategic Cost Management', 'MAN ECON': 'Managerial Economics', 'BUS LAW 1': 'Law on Obligations and Contracts', 'BUS LAW 2': 'Business Laws and Regulations',
  'BUS LAW 3': 'Regulatory Framework and Legal Issues in Business', 'TAX 1': 'Income Taxation', 'TAX 2': 'Business Taxation', 'IT BUS': 'IT Application Tools in Business',
  'AIS 100': 'Accounting Information Systems', 'BUS ETH': 'Governance, Business Ethics, Risk Management, and Internal Control', 'FIN MGT': 'Financial Management',
  'HBO': 'Human Behavior in Organizations', 'MGT SCI': 'Management Science', 'STAT ANL': 'Statistical Analysis with Software Application',
  'INTL BUS': 'International Business and Trade', 'FIN MKT': 'Financial Markets', 'ECON DEV': 'Economic Development', 'STRAT ANL': 'Strategic Business Analysis',
  'MGT 100': 'Management', 'SSM 107': 'Micro Economics', 'MKT 100': 'Marketing', 'FM 100': 'Finance', 'HRM 100': 'Human Resource Management',
  'SOC RES': 'Good Governance and Social Responsibility', 'BA 199': 'Business Research 1: Methods', 'BA 190': 'Statistical Techniques in Business Research',
  'BA 200': 'Business Research 2: Thesis', 'ENTREP': 'Entrepreneurial Management', 'HRM 158': 'Organizational Development',
};

export function parse(entry: string): { code: string; title: string } {
  const [code, title] = entry.split('|');
  const t = title ?? D[code];
  if (!t) throw new Error(`No title for subject code "${code}"`);
  return { code, title: t };
}

type Cur = Record<string, string[]>;

// ---- Teacher education (BEED, BPE, BSED majors)
const teach = (x: Cur): Cur => ({
  '1.1': ['EDUC 101', 'MST 1', 'AH 1', 'ELEC 1', 'PE 1', 'NSTP 1'],
  '1.2': ['EDUC 105', 'ELEC 2', 'SSP 1', 'SSP 2', 'SSP 4', 'PE 2', 'NSTP 2', ...(x['1.2'] || [])],
  '2.1': ['PED 5A', 'EDUC 104', 'EDUC 102', 'ELEC 3', 'PE 3', ...(x['2.1'] || [])],
  '2.2': ['PED 5B', 'EDUC 108', 'SSP 3', 'MST 2', 'PE 4', ...(x['2.2'] || [])],
  '2.3': x['2.3'] || [],
  '3.1': ['EDUC 109', 'EDUC 107.1', 'EDUC 106.1', 'RIZAL', 'AH 2', 'SSP 5', ...(x['3.1'] || [])],
  '3.2': ['EDUC 190', 'EDUC 107.2', 'EDUC 106.2', ...(x['3.2'] || [])],
  '3.3': x['3.3'] || [],
  '4.1': ['EDUC 200', 'EDUC 103', 'FS 102', 'ENG 155', ...(x['4.1'] || [])],
});

// ---- Accountancy and AIS share the first two years
const ACCT_BASE: Cur = {
  '1.1': ['ACCT 99', 'ACCT 101', 'MAN ECON', 'ELEC 1', 'SSP 1', 'SSP 2', 'PE 1', 'NSTP 1'],
  '1.2': ['ACCT 105', 'ACCT 100', 'BUS LAW 1', 'ELEC 2', 'MST 1', 'SSP 5', 'AH 1', 'PE 2', 'NSTP 2'],
  '2.1': ['ACCT 106', 'ACCT 102', 'BUS LAW 2', 'TAX 1', 'IT BUS', 'SSP 4', 'MST 2', 'PE 3'],
  '2.2': ['ACCT 103', 'AIS 100', 'TAX 2', 'BUS LAW 3', 'BUS ETH', 'FIN MGT', 'OM-TQM', 'PE 4'],
};

// ---- BSBA majors share a common core
const bsba = (s: { y22: string[]; y31: string[]; y32: string[] }): Cur => ({
  '1.1': ['MGT 100', 'SSM 107', 'SSP 1', 'SSP 2', 'PE 1', 'NSTP 1'],
  '1.2': ['MKT 100', 'FM 100', 'MST 1', 'SSP 5', 'AH 1', 'PE 2', 'NSTP 2'],
  '2.1': ['HRM 100', 'ACCT 99', 'BUS LAW 1', 'SSP 4', 'MST 2', 'ELEC 1', 'PE 3'],
  '2.2': ['OM-TQM', 'SOC RES', 'ELEC 2', 'PE 4', ...s.y22],
  '3.1': ['TAX 1', 'SSP 3', ...s.y31],
  '3.2': ['BA 199', 'BA 190', 'ENTREP', 'ENG 155', 'ELEC 3', ...s.y32],
  '3.3': ['RIZAL', 'AH 2'],
  '4.2': ['BA 200', 'INTL BUS', 'STRAT'],
});

export const CURRICULUM: Record<string, Cur> = {
  'ABENG': {
    '1.1': ['EDUC 101', 'MST 1', 'AH 1', 'ELEC 1', 'PE 1', 'NSTP 1'],
    '1.2': ['EDUC 105', 'ENG101|Introduction to the English Language System', 'ELEC 2', 'SSP 1', 'SSP 2', 'SSP 4', 'PE 2', 'NSTP 2'],
    '2.1': ['COMM 100|Introduction to Communication and Media', 'ENG102|Theories of Language and Language Acquisition', 'ENG105|English Syntax', 'ENG104|English Phonology and Morphology', 'ENG103|History of English Language', 'F.LANG 1|European Foreign Language 1 (Basic Spanish / French / Italian 1)', 'ELEC 3', 'PE 3'],
    '2.2': ['COMM 101|Communication Theory', 'ENG 151|English Language Teaching Methods and Approaches', 'ENG 177|Speech and Stage Arts', 'ENG 175|Varieties of English', 'ENG 172|Language and Advertising', 'F.LANG 2|European Foreign Language 2 (Basic Spanish / French / Italian 2)', 'SSP 3', 'MST 2'],
    '2.3': ['ENG 153|Instructional Materials Development and Evaluation', 'ENG 109|Introduction to Language, Society, and Culture', 'ENG 171|Language and Journalism'],
    '3.1': ['COMM 102|Broadcasting Principles and Practices', 'ENG 173|Survey of Philippine Literature in English', 'ENG 110|Language and Literary Texts', 'ENG 108|Stylistics', 'ENG 107|English Discourse', 'ENG106|Semantics in English', 'AH 2', 'F.LANG 4|Asian Foreign Language 2 (Basic Mandarin / Nihongo / Korean)'],
    '3.2': ['COMM 103|Introduction to Film', 'ENG 199|Language Research 1: Methodology', 'ENG 190|Statistical Techniques in English Language Research', 'ENG 155', 'ENG 174|Survey of Afro-Asian Literature', 'ENG 154|English Language Curriculum Development', 'F.LANG 3|Asian Foreign Language 1 (Basic Mandarin / Nihongo / Korean)'],
    '3.3': ['ENG 112|Computer-Mediated Communication', 'ENG 111|Language and Non-Literary Texts', 'RIZAL'],
    '4.1': ['ENG 200|Language Research: Thesis', 'COMM 102|Communication Media Laws and Ethics', 'EDUC 102', 'ENG 152|English Language Testing and Assessment', 'SSP 5'],
  },
  'BEED': teach({
    '2.1': ['EM-ENG 1|Teaching English in the Elementary Grades (Language Arts)', 'EM-FIL 1|Pagtuturo ng Filipino sa Elementarya (Estruktura at Gamit ng Wikang Filipino)'],
    '2.2': ['EM-ENG 2|Teaching English in the Elementary Grades (Literature)', 'EM-SCI 1|Teaching Science in the Elementary Grades (Physics, Earth, and Space Science)', 'EM-MATH 1|Teaching Math in the Primary Grades'],
    '2.3': ['EM-SCI 2|Teaching Science in the Elementary Grades (Biology and Chemistry)', 'EM-MATH 2|Teaching Math in the Intermediate Grades', 'EM-FIL 2|Pagtuturo ng Filipino sa Elementarya (Panitikan ng Pilipinas)'],
    '3.1': ['EM-TLE 1|Edukasyong Pantahanan at Pangkabuhayan 1', 'EM-MUSIC|Teaching Music in the Elementary Grades'],
    '3.2': ['EDUC 199|Research in Education (Methods)', 'FS 101', 'EM-TLE 2|Edukasyong Pantahanan at Pangkabuhayan 2 (Entrepreneurship)', 'EM-SOC 2|Teaching SS in the Elementary Grades 2 (Culture and Geography)'],
    '3.3': ['EM-SOC 1|Teaching SS in the Elementary Grades 1 (Philippine History and Government)', 'EM-ARTS|Teaching Arts in the Elementary Grades', 'EM-MGC|Teaching Multi-Grade Classes'],
    '4.1': ['EM-MT|Content and Pedagogy for the Mother-Tongue', 'EM-VED|Good Manners and Right Conduct (Edukasyon sa Pagpapakatao)', 'EM-PEH|Teaching P.E. and Health in the Elementary Grades'],
  }),
  'BPE': teach({
    '2.1': ['PE 101|Philosophical and Socio-anthropological Foundations of Physical Education and Sports', 'PE 102|Anatomy and Physiology of Human Movement'],
    '2.2': ['HED 102|Personal, Community, and Environmental Health', 'PE 109|Movement Education', 'PE 106|Curriculum and Assessment for PE and Health Education', 'PE 103|Physiology of Exercise and Physical Activity'],
    '2.3': ['PE 105|Sports and Exercise Psychology', 'PE 104|Principles of Motor Control and Learning of Exercise, Sports, and Dance', 'PE 114|Philippine Traditional Games'],
    '3.1': ['PE 110|Philippine Traditional Dances', 'PE 112|Individual and Dual Sports'],
    '3.2': ['SSM 199|Research in Social Studies', 'FS 101', 'PE 111|International Dance and Other Forms', 'PE 113|Team Sports', 'PE 115|Swimming and Aquatics'],
    '3.3': ['PE 108|Applied Motor Control and Learning of Exercise, Sports, and Dance', 'HED 103|Drug Education, Consumer Health Education and Healthy Eating', 'HED 101|Coordinated School Health Program'],
    '4.1': ['PE 107|Process of Teaching PE and Health Education', 'Music 100|Music in the K to 12 Curriculum', 'Arts 100|Arts in the K to 12 Curriculum', 'HED 104|Emergency Preparedness and Safety Management'],
  }),
  'BSED-ENG': teach({
    '1.2': ['ENG101|Introduction to Linguistics'],
    '2.1': ['ENG102|Principles and Theories of Language Acquisition and Learning', 'ENG105|Structure of English'],
    '2.2': ['ENG 177|Speech and Theater Arts', 'ENG 70|Literary Criticism', 'ENG 50|Technical Writing'],
    '2.3': ['ENG 153|Instructional Materials Development and Evaluation', 'ENG 109|Introduction to Language, Society, and Culture', 'ENG 171|Campus Journalism'],
    '3.1': ['ENG 173|Survey of Philippine Literature in English', 'ENG 108|Stylistics and Discourse Analysis'],
    '3.2': ['ENG 199|Research in Language Education', 'ENG 174|Survey of Afro-Asian Literature', 'ENG 71|Mythology and Folklore', 'ENG 51|Teaching and Assessment of Grammar', 'ENG 52|Remedial Instruction'],
    '3.3': ['ENG 53|Language Programs and Policies in Multilingual Societies', 'ENG 72|Contemporary, Popular, and Emergent Literature', 'ENG 73|Children and Adolescent Literature'],
    '4.1': ['ENG 72|Survey of English and American Literature', 'ENG 54|Teaching and Assessment of Literature Studies', 'ENG 55|Teaching and Assessment of Macro Skills'],
  }),
  'BSED-FIL': teach({
    '2.1': ['FM 101|Introduksyon sa Pag-aaral ng Wika', 'FM 102|Panimulang Linggwistika'],
    '2.2': ['FM 103|Ang Filipino sa Kurikulum ng Batayang Edukasyon', 'FM 104|Estruktura ng Wikang Filipino', 'FM 115|Panunuring Pampanitikan'],
    '2.3': ['FM 108|Introduksyon sa Pagsasalin', 'FM 109|Introduksyon sa Pamamahayag', 'FM 112|Panitikan ng Rehiyon'],
    '3.1': ['FM 105|Pagtuturo at Pagtataya ng Makrong Kasanayang Pangwika', 'FM 107|Paghahanda at Ebalwasyon ng Kagamitang Panturo'],
    '3.2': ['FM 199|Introduksyon sa Pananaliksik - Wika at Panitikan', 'FS 101', 'FM 116|Maikling Kwento at Nobelang Filipino', 'FM 117|Panulaang Filipino', 'FM 118|Dulaang Filipino'],
    '3.3': ['FM 106|Ugnayan ng Wika, Kultura at Lipunan', 'FM 113|Kulturang Popular', 'FM 114|Sanaysay at Talumpati'],
    '4.1': ['FM 110|Barayti at Baryasyon ng Wika', 'FM 111|Mga Natatanging Diskurso sa Wika at Panitikan', 'FM 119|Filipino sa Natatanging Gamit', 'FM 120|Malikhaing Pagsulat'],
  }),
  'BSED-MATH': teach({
    '2.1': ['MM 102|College and Advanced Algebra', 'MM 103|Trigonometry'],
    '2.2': ['MM 104|Plane and Solid Geometry', 'MM 107|Analytic Geometry with Calculus 1', 'MM 106|Elementary Statistics and Probability'],
    '2.3': ['MM 101|History of Mathematics', 'MM 105|Logic and Set Theory', 'MM 113|Linear Algebra'],
    '3.1': ['MM 108|Calculus 2', 'MM 112|Number Theory'],
    '3.2': ['MM 199|Research in Mathematics', 'FS 101', 'MM 109|Calculus 3', 'MM 111|Mathematics of Investment'],
    '3.3': ['MM 114|Advanced Statistics', 'MM 115|Problem Solving, Mathematical Investigation and Modeling', 'MM 116|Abstract Algebra'],
    '4.1': ['MM 110|Modern Geometry', 'MM 117|Principles and Strategies in Teaching Mathematics'],
  }),
  'BSED-SCI': teach({
    '2.1': ['BIO 50|Anatomy and Physiology w/ lab', 'SM 102|Earth Science'],
    '2.2': ['CHEM 50|Inorganic Chemistry', 'BIO 51|Cell and Molecular Biology w/ lab', 'SM 103|Environmental Science'],
    '2.3': ['BIO 52|Genetics w/ lab', 'BIO 53|Microbiology and Parasitology w/ lab'],
    '3.1': ['CHEM 51|Organic Chemistry w/ lab', 'CHEM 52|Analytical Chemistry w/ lab'],
    '3.2': ['SM 199|Research in Teaching Science', 'FS 101', 'CHEM 53|Biochemistry', 'PHYS 50|Thermodynamics w/ lab', 'PHYS 51|Electricity and Magnetism w/ lab'],
    '3.3': ['PHYS 52|Fluid Mechanics', 'SM 104|Astronomy', 'SM 105|Meteorology'],
    '4.1': ['SM 106|The Teaching of Science', 'PHYS 53|Waves and Optics w/ lab', 'PHYS 54|Modern Physics'],
  }),
  'BSED-SOC': teach({
    '2.1': ['SSM 104|Geography 1 (Basic)', 'SSM 107'],
    '2.2': ['SSM 105|Geography 2 (Philippines)', 'SSM 109|World History 1 (Asia and Oceana)', 'SSM 101|Foundation of Social Studies', 'SSM 114|Comparative Government and Politics'],
    '2.3': ['SSM 108|Macro Economics', 'SSM 111|Asian Studies', 'SSM 112|Socio-Cultural Anthropology'],
    '3.1': ['SSM 106|Geography 3 (World)', 'SSM 110|World History 2 (Europe and America)'],
    '3.2': ['SSM 199|Research in Social Studies', 'FS 101', 'SSM 115|Law-Related Studies', 'SSM 116|Teaching Approaches in Secondary Social Studies', 'SSM 119|Assessment and Evaluation in Social Studies'],
    '3.3': ['SSM 103|Places and Landscape in a Changing World', 'SSM 113|Comparative Economic Planning', 'SSM 121|Social Networking for Social Integration'],
    '4.1': ['HRD 100|Human Resources Management', 'SSM 102|Trends and Issues in Social Studies', 'SSM 117|Integrative Methods in Teaching Social Science Discipline in Basic Education', 'SSM 118|Production of Social Studies Instructional Materials'],
  }),
  'BSED-VAL': {
    ...teach({
      '2.1': ['VM 101|Philosophical and Ethical Foundations of Values Education', 'VM 102|Philippine Culture and Society'],
      '2.2': ['VM 103|Psychological Theories of Values Development', 'VM 104|Foundation of Values Education', 'VM 105|Contemporary Family Life'],
      '2.3': ['VM 106|Development of Values Education Instructional Materials and Assessment Tools', 'VM 107|Psycho-Spiritual Development', 'VM 108|Filipino Values System'],
      '3.1': ['VM 109|Career Development and Work Values', 'VM 110|Transformative Education'],
      '3.2': ['VM 199|Research in Values Education 1 (Methods)', 'FS 101', 'VM 111|Introduction to Guidance and Counseling', 'VM 112|Dynamics of Inter and Intrapersonal Relations'],
      '3.3': ['VM 113|Information Technology and Human Development', 'VM 114|Values Integration in various Disciplines', 'VM 115|Moral Issues and Concerns in Contemporary Living'],
    }),
    '4.1': ['VM 200|Research in Values Education 2 (Thesis)', 'EDUC 103', 'FS 102', 'ENG 155', 'VM 116|Values Education through Community Service', 'VM 117|Facilitation: Theory and Practice', 'VM 118|Teaching Approaches and Strategies in Values Education'],
  },
  'BSA': {
    ...ACCT_BASE,
    '2.3': ['ACCT 104', 'HBO', 'MGT SCI'],
    '3.1': ['ACCT 157|Accounting for Business Combinations', 'ACCT 156|Accounting for Special Transactions', 'ACCT 152|Auditing Assurance: Concepts and Applications 1', 'ACCT 151|Auditing and Assurance Principles', 'STAT ANL', 'ELEC 3', 'SSP 3', 'AH 2'],
    '3.2': ['ACCT 199|Accounting Research 1: Methods', 'ACCT 158|Accounting for Government and Non-profit Organizations', 'ACCT 155|Auditing in a CIS Environment', 'ACCT 154|Auditing Assurance: Specialized Industries', 'ACCT 153|Auditing Assurance: Concepts and Applications 2', 'INTL BUS', 'RIZAL'],
    '3.3': ['FIN MKT', 'ECON DEV', 'ENG 155'],
    '4.2': ['ACCT 200|Accounting Research 2: Thesis', 'PED 5A|Principles and Methods of Teaching Accounting', 'STRAT ANL', 'STRAT', 'FR STND|Updates in Financial Reporting Standards', 'OPS AUDIT|Operations Auditing'],
  },
  'BSAIS': {
    ...ACCT_BASE,
    '2.3': ['ACCT 104', 'MGT SCI'],
    '3.1': ['AIS 151|Information System Analysis and Design', 'AIS 150|Project Management', 'BUS ANL|Business Analytics', 'FIN MDL|Financial Modeling', 'STAT ANL', 'ELEC 3', 'SSP 3', 'AH 2'],
    '3.2': ['AIS 199|Accounting Information System Research 1: Methods', 'AIS 154|Information Security and Management', 'AIS 153|Information Systems Operations and Maintenance', 'AIS 152|Managing Information Technology', 'AIS 157|Management Information System', 'INTL BUS', 'RIZAL'],
    '3.3': ['FIN MKT', 'ECON DEV', 'ENG 155'],
    '4.2': ['AIS 200|Accounting Information System Research 2: Thesis', 'AIS 156|Data Warehousing and Management', 'AIS 155|Enterprise Resource Planning and Management', 'STRAT', 'STRAT ANL'],
  },
  'BSBA-FM': bsba({
    y22: ['FM 151|Financial Management', 'FM 152|Capital Market', 'FM 153|Credit and Collection'],
    y31: ['FM 154|Banking and Financial Institutions', 'FM 155|Monetary Policy and Central Banking', 'FM 156|Investment and Portfolio Management', 'FM 157|Special Topics in Financial Management'],
    y32: ['FM 158|Financial Analysis and Reporting'],
  }),
  'BSBA-HRM': bsba({
    y22: ['HRM 151|Administrative Office Management', 'HRM 152|Labor Law and Legislation', 'HRM 153|Recruitment and Selection'],
    y31: ['HRM 154|Training and Development', 'HRM 155|Compensation Administration', 'HRM 156|Labor Relations and Negotiations', 'HRM 157|Special Topics in Human Resource Management'],
    y32: ['HRM 158'],
  }),
  'BSBA-MKT': bsba({
    y22: ['MKT 151|Marketing Management', 'MKT 152|Product Management', 'MKT 153|Advertising'],
    y31: ['MKT 154|Pricing Strategy', 'MKT 155|Retail Management', 'MKT 156|Distribution Management', 'MKT 157|Professional Salesmanship'],
    y32: ['HRM 158'],
  }),
  'BSCE': {
    '1.1': ['ES 11|Civil Engineering Orientation', 'CHEM 31|Chemistry for Engineers', 'MATH 10|Pre-Calculus', 'SSP 2', 'MST 1', 'MST 2', 'PE 1', 'NSTP 1'],
    '1.2': ['ES 12|Engineering Drawing and Plans', 'ES 13|Computer Fundamentals and Programming', 'PHYS 31|Physics for Engineers (Calculus-based)', 'MATH 11|Calculus 1', 'SSP 1', 'SSP 3', 'RIZAL', 'PE 2', 'NSTP 2'],
    '1.3': ['MATH 13|Calculus 2', 'AH 1', 'ELEC 1'],
    '2.1': ['ES 14|Computer-Aided Drawing', 'ES 15|Statics of Rigid Bodies', 'ES 20|Engineering Management', 'MATH 13|Differential Equations', 'AH 2', 'ELEC 2', 'PE 3'],
    '2.2': ['CE 101|Fundamentals of Surveying', 'ES 16|Dynamics of Rigid Bodies', 'ES 17|Mechanics of Deformable Bodies', 'ES 18|Engineering Economics', 'GEOL 31|Geology for Engineers', 'MATH 14|Engineering Data Analysis', 'PE 4'],
    '3.1': ['CE 102|Construction Materials Testing', 'CE 103|Structural Theory', 'CE 104|Highway and Railroad Engineering', 'EU 111|Engineering Utilities 1', 'EU 112|Engineering Utilities 2', 'MATH 15|Numerical Solutions to CE Problems', 'SSP 4', 'ELEC 3'],
    '3.2': ['CE 105|Building Systems Design', 'CE 106|Principles of Steel Design', 'CE 107|Principles of Reinforced / Prestressed Concrete', 'CE 108|Hydraulics', 'CE 109|Hydrology', 'CE 110|CE Law, Ethics and Contracts', 'ES 19|Technopreneurship 101', 'ENG 155'],
    '4.1': ['CE 199|CE Project 1', 'CE 111|Geotechnical Engineering 1 (Soil Mechanics)', 'CE 112|Principles of Transportation Engineering', 'CEM 101|Project Construction and Management', 'CEM 102|Advanced Construction Methods and Equipment', 'SSP 5'],
    '4.2': ['CE 200|CE Project 2', 'CE 113|Quantity Surveying', 'CE 114|Construction Methods and Project Management', 'CEM 103|Construction Cost Engineering', 'CEM 104|Database Management in Construction', 'CEM 105|Construction Occupational Safety and Health (COSH)'],
  },
  'BSCRIM': {
    '1.1': ['CRIM 101|Introduction to Criminology', 'CRIM 104|Professional Conduct and Ethical Standards', 'MST 1', 'AH 1', 'RIZAL', 'AH 2', 'ELEC 1', 'PE1A|Fundamentals of Martial Arts', 'ROTC 1|Reserved Officers Training Corps 1'],
    '1.2': ['CRIM 102|Theories of Crime Causation', 'CLJ 10|Introduction to Criminal Justice System', 'LEA 101|Law Enforcement Organization and Administration (Inter-agency Approach)', 'ELEC 2', 'SSP 1', 'SSP 2', 'SSP 4', 'PE 2A|Arnis and Disarming Technique', 'ROTC 1|Reserved Officers Training Corps 1'],
    '2.1': ['CRIM 103|Human Behavior and Victimology', 'CDI 101|Fundamentals of Criminal Investigation and Intelligence', 'LEA 103|Introduction to Industrial Security Concepts', 'FRSC 101|Forensic Photography', 'CLJ 12|Criminal Law 1', 'CHEM 11|General Chemistry (Organic)', 'SSP 3', 'PE 3A|First Aid and Water Safety'],
    '2.2': ['LEA 104|Law Enforcement Operations and Planning with Crime Mapping', 'CLJ 13|Criminal Law 2', 'CDI 105|Technical English 1 (Investigative Report Writing and Presentation)', 'CA 101|Institutional Corrections', 'FRSC 102|Personal Identification Techniques', 'FRSC 103|Forensic Chemistry and Toxicology', 'ELEC 3', 'PE 4A|Fundamentals of Marksmanship'],
    '2.3': ['LEA 102|Comparative Models in Policing', 'CLJ 11|Human Rights Education', 'CFLM 101|Character Formation 1 (Nationalism and Patriotism)'],
    '3.1': ['CRIM 105|Juvenile Delinquency and Juvenile Justice System', 'CDI 102|Specialized Crime Investigation 1 with Legal Medicine', 'CDI 104|Traffic Management and Accident Investigation with Driving', 'CDI 108|Technical English 1 (Legal Forms)', 'FRSC 104|Questioned Documents Examination', 'FRSC 106|Forensic Ballistics', 'CLJ 14|Evidence', 'MST 2'],
    '3.2': ['CRIM 199|Criminological Research 1: Methods', 'CRIM 190|Statistical Techniques in Criminological Research', 'CDI 103|Specialized Crime Investigation 2 with Simulation on Interrogation and Interview', 'CA 102|Non-institutional Corrections', 'FRSC 105|Lie Detection Techniques', 'CLJ 15|Criminal Procedure and Court Testimony'],
    '3.3': ['CA 103|Therapeutic Modalities', 'CFLM 102|Character Formation 2 (Leadership, Decision Making, Management and Administration)', 'CRIM 106|Dispute Resolution and Crises or Incidents Management'],
    '4.1': ['CRIM 200|Criminological Research 2: Thesis', 'CDI 109|Introduction to Cybercrime and Environmental Laws Protection', 'CDI 107|Vice and Drug Education and Control', 'CDI 106|Fire Protection and Arson Investigation', 'SSP 5'],
  },
  'BSHM': {
    '1.1': ['HM 105|Macro Perspective of Tourism and Hospitality', 'HM 102|Risk Management as Applied to Safety, Security and Sanitation', 'HM 101|Philippine Culture and Tourism Geography', 'SSP 1', 'SSP 2', 'PE 1', 'NSTP 1'],
    '1.2': ['HM 153|Fundamentals in Lodging Operations', 'HM 151|Kitchen Essentials and Basic Food Preparation', 'HM 154|Applied Business Tools and Techniques', 'MST 1', 'AH 1', 'PE 2', 'NSTP 2'],
    '2.1': ['HM 152|Fundamentals in Food Service Operations', 'HSKPNG|Housekeeping Operations', 'ASIAN|Asian Cuisine', 'F.LANG 1|Foreign Language 1 (Spanish / French / Mandarin / Nihonggo / Korean)', 'SSP 4', 'MST 2', 'ELEC 1', 'PE 3'],
    '2.2': ['HM 108|Tourism and Hospitality Marketing', 'BAKING|Bread and Pastry', 'BAR MGT|Bar and Beverage Management with Laboratory', 'F.LANG 2|Foreign Language 2 (Spanish / French / Mandarin / Nihonggo / Korean)', 'OM-TQM', 'ELEC 2', 'PE 4'],
    '2.3': ['HM 107|Multicultural Diversity in the Workplace for the Tourism Professional', 'HM 109|Micro Perspective of Tourism and Hospitality'],
    '3.1': ['HM 156|Introduction to Meeting Incentives, Conferences and Events Management (MICE)', 'HM 155|Supply Chain Management in Hospitality Industry', 'CATERING|Catering Management', 'ENG 155', 'SSP 3', 'ELEC 3', 'AH 2'],
    '3.2': ['HM 199|Research in Hospitality 1: Methods', 'HM 190|Statistical Techniques in Hospitality Research', 'HM 157|Ergonomics and Facilities Planning for the Hospitality Industry', 'HM 110|Entrepreneurship in Tourism and Hospitality', 'RIZAL', 'SSP 5'],
    '3.3': ['HM 103|Quality Service Management in Tourism and Hospitality', 'HM 106|Professional Development and Applied Ethics'],
    '4.2': ['HM 200|Research in Hospitality 2: Thesis', 'STRAT', 'HM 104|Legal Aspects in Tourism and Hospitality'],
  },
  'BSIS': {
    '1.1': ['IT 120|Introduction to Computing', 'IT 121|Introduction to Programming 1', 'SSP 1', 'SSP 2', 'PE 1', 'NSTP 1'],
    '1.2': ['IS 120|Fundamentals of Information Systems', 'IT 122|Introduction to Programming 2', 'MST 1', 'AH 1', 'PE 2', 'NSTP 2'],
    '2.1': ['IS 150|Organization and Management Concepts', 'IS 122|IT Infrastructure and Network Technologies', 'IT 171|Object-Oriented Programming', 'IT 123|Data Structures and Algorithms', 'SSP 4', 'ELEC 1', 'PE 3'],
    '2.2': ['IS 151|Accounting and Financial Management', 'IS 123|System Analysis and Design', 'IS 121|Professional Issues in Information Systems', 'IT 172|Fundamentals of Database Systems', 'MST 2', 'ELEC 2', 'PE 4'],
    '3.1': ['IS 124|Enterprise Architecture', 'IS 152|Business Process Management', 'IS 154|Quantitative Methods', 'IT 125|Application Development and Emerging Technologies', 'IT 174|Software Engineering', 'IT 175|Multimedia Systems', 'SSP 3'],
    '3.2': ['IS 190|Methods of Research', 'IT 124|Information Management', 'IS 153|Evaluation of Business Performance', 'IS 125|IS Project Management', 'IT 173|Networking 1', 'ENG 155', 'AH 2'],
    '3.3': ['ELEC 3', 'RIZAL', 'SSP 5'],
    '4.1': ['IS 199|Capstone Project 1'],
    '4.2': ['IS 200|Capstone Project 2', 'IS 126|IS Strategy Management and Acquisition'],
  },
  'BSPSYCH': {
    '1.1': ['PSY 101|Introduction to Psychology', 'BIO 11|General Zoology', 'SSP 1', 'SSP 2', 'PE 1', 'NSTP 1'],
    '1.2': ['PSY 102|Psychological Statistics', 'PSY 151|Developmental Psychology', 'PSY 154|Biological Psychology', 'MST 1', 'AH 1', 'PE 2', 'NSTP 2'],
    '2.1': ['PSY 153|Theories of Personality', 'PSY 152|Cognitive Psychology', 'PSY 155|Experimental Psychology', 'SSP 4', 'MST 2', 'ELEC 1', 'PE 3'],
    '2.2': ['PSY 156|Field Methods in Psychology', 'PSY 157|Social Psychology', 'PSY 159|Abnormal Psychology', 'PED 5A', 'SSP 5', 'ELEC 2', 'PE 4'],
    '3.1': ['PSY 161|Filipino Psychology', 'PSY 160|Industrial / Organizational Psychology', 'PSY 158|Psychological Assessment', 'CHEM 11|General and Organic Chemistry', 'ELEC 3', 'ENG 173|Survey of Philippine Literature in English'],
    '3.2': ['PSY 199|Research in Psychology 1: Methods', 'PSY 171|Introduction to Counseling', 'PSY 172|Group Dynamics', 'ENG 155', 'CHEM 12|Biochemistry', 'SSP 3'],
    '4.2': ['PSY 200|Research in Psychology 2: Thesis', 'BIO 12|Human Anatomy and Physiology', 'ENG 174|Survey of Afro-Asian Literature', 'RIZAL', 'AH 2'],
  },
};
