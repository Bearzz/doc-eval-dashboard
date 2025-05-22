import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { UploadCloud, FileText, AlertTriangle, CheckCircle, Search, TrendingUp, ChevronDown, ChevronRight, Filter, XCircle, ExternalLink, Info, ListChecks, LayoutDashboard, TableIcon, BookOpen } from 'lucide-react'; // Removed Edit3, Save

// Constants for sub-criteria names and keys
const WQ_CRITERIA_KEYS = ['WQ1', 'WQ2', 'WQ3', 'WQ4', 'WQ5', 'WQ6', 'WQ7', 'WQ8'];
const TV_CRITERIA_KEYS = ['TV1', 'TV2', 'TV3', 'TV4', 'TV5', 'TV6'];

const WQ_CRITERIA_NAMES = {
  WQ1: "Clarity & Simplicity",
  WQ2: "Logical Structure & Flow",
  WQ3: "Modular Structure",
  WQ4: "Precision & Accuracy",
  WQ5: "Tone & Language",
  WQ6: "Grammar & Mechanics",
  WQ7: "Self-Containment",
  WQ8: "Question-Oriented Framing",
};

const TV_CRITERIA_NAMES = {
  TV1: "User Task Alignment",
  TV2: "Completeness",
  TV3: "Frequency & Use",
  TV4: "Operational Significance",
  TV5: "Originality",
  TV6: "Automation Enablement",
};

const EXPECTED_CSV_COLUMNS = [
  'PageTitle', 'PageURL', 'AssessmentDate',
  ...WQ_CRITERIA_KEYS,
  ...TV_CRITERIA_KEYS
]; // Total 3 + 8 + 6 = 17 columns

// Helper function to calculate average
const calculateAverage = (scores) => {
  if (!scores || scores.length === 0) return 0;
  const sum = scores.reduce((acc, score) => acc + (parseFloat(score) || 0), 0);
  return sum / scores.length;
};

// Helper function to check if any sub-score is low
const anySubScoreLow = (subScores, keys, threshold = 5) => {
  return keys.some(key => (parseFloat(subScores[key]) || 0) <= threshold);
};

// Recommendation Logic (STILL HARDCODED FOR NOW)
const getWritingQualityRecommendation = (overallScore, anyWQSubScoreLow) => {
  const score = Math.round(overallScore); 
  if (score >= 9 && !anyWQSubScoreLow) return "✅ Publish as-is";
  if (score >= 6 && score <= 8 && !anyWQSubScoreLow) return "🔍 Spot fix optional";
  if (score >= 6 && score <= 8 && anyWQSubScoreLow) return "🛠️ Needs targeted revision";
  if (score >= 3 && score <= 5 && anyWQSubScoreLow) return "⚠️ Needs full rewrite or review";
  if (score >= 1 && score <= 2 && anyWQSubScoreLow) return "❌ Do not publish as-is";
  if (score >= 9 && anyWQSubScoreLow) return "🛠️ Needs targeted revision (High score w/ low sub-item)";
  if ((score >= 3 && score <= 5 && !anyWQSubScoreLow) || (score >= 1 && score <= 2 && !anyWQSubScoreLow)) return "⚠️ Review needed (Low score w/o low sub-item)";
  return "ℹ️ Review criteria";
};

const getTopicValueRecommendation = (overallScore, anyTVSubScoreLow) => {
  const score = Math.round(overallScore);
  if (score >= 9 && !anyTVSubScoreLow) return "✅ High-priority topic";
  if (score >= 6 && score <= 8) return "🔍 Valuable, refine if needed"; 
  if (score >= 3 && score <= 5 && anyTVSubScoreLow) return "⚠️ Needs update or merge";
  if (score >= 1 && score <= 2 && anyTVSubScoreLow) return "❌ Deprioritize or remove";
  if (score >= 9 && anyTVSubScoreLow) return "🔍 Valuable, refine if needed (High score w/ low sub-item)";
  if ((score >= 3 && score <= 5 && !anyTVSubScoreLow) || (score >= 1 && score <= 2 && !anyTVSubScoreLow)) return "⚠️ Review needed (Low score w/o low sub-item)";
  return "ℹ️ Review criteria";
};

const CRITICAL_RECOMMENDATIONS = [
  "⚠️ Needs update or merge",
  "🛠️ Needs targeted revision",
  "⚠️ Needs full rewrite or review",
  "❌ Deprioritize or remove",
  "❌ Do not publish as-is",
  "🛠️ Needs targeted revision (High score w/ low sub-item)",
  "⚠️ Review needed (Low score w/o low sub-item)",
];

// Main App Component
function App() {
  const [pagesData, setPagesData] = useState([]);
  const [error, setError] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [activeTab, setActiveTab] = useState('snapshot'); // snapshot, actionNeeded, detailedView, criteriaDocs

  const [detailedViewSortConfig, setDetailedViewSortConfig] = useState({ key: 'PageTitle', direction: 'ascending' });
  const [detailedViewFilter, setDetailedViewFilter] = useState('');

  const [actionNeededSortConfig, setActionNeededSortConfig] = useState({ key: 'OverallWQScore', direction: 'ascending' });

  // State for criteria documents
  const [wqCriteriaText, setWqCriteriaText] = useState('');
  const [tvCriteriaText, setTvCriteriaText] = useState('');
  // Removed editingCriteria state
  const [wqCriteriaFileName, setWqCriteriaFileName] = useState('');
  const [tvCriteriaFileName, setTvCriteriaFileName] = useState('');


  const handleCsvFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setCsvFileName(file.name);
      setError(''); // Clear previous CSV errors
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const csvText = e.target.result;
          const lines = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
          if (lines.length < 2) {
            setError("CSV file must have a header row and at least one data row.");
            setPagesData([]);
            return;
          }
          
          const header = lines[0].split(',').map(h => h.trim());
          if (header.length !== EXPECTED_CSV_COLUMNS.length || !EXPECTED_CSV_COLUMNS.every((col, i) => header[i] === col)) {
             setError(`CSV header does not match expected format. Expected: ${EXPECTED_CSV_COLUMNS.join(', ')}. Found: ${header.join(', ')}`);
             setPagesData([]);
             return;
          }

          const data = lines.slice(1).map((line, rowIndex) => {
            const values = line.split(',');
            if (values.length !== header.length) {
              console.warn(`Row ${rowIndex + 1} has incorrect number of columns. Expected ${header.length}, got ${values.length}. Skipping row.`);
              return null; 
            }
            let page = {};
            header.forEach((col, index) => {
              page[col] = values[index] ? values[index].trim() : '';
            });
            page.id = `page-${rowIndex}`; 

            WQ_CRITERIA_KEYS.forEach(key => page[key] = parseFloat(page[key]) || 0);
            TV_CRITERIA_KEYS.forEach(key => page[key] = parseFloat(page[key]) || 0);
            
            return page;
          }).filter(page => page !== null); 

          setPagesData(data);
        } catch (err) { // Corrected syntax: removed "=>"
          setError("Error parsing CSV file. Please ensure it's a valid CSV. " + err.message);
          setPagesData([]);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleCriteriaFileUpload = (event, type) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        if (type === 'wq') {
          setWqCriteriaText(text);
          setWqCriteriaFileName(file.name);
        } else if (type === 'tv') {
          setTvCriteriaText(text);
          setTvCriteriaFileName(file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  const processedPagesData = useMemo(() => {
    return pagesData.map(page => {
      const wqScores = WQ_CRITERIA_KEYS.map(key => page[key]);
      const tvScores = TV_CRITERIA_KEYS.map(key => page[key]);

      const overallWQScore = calculateAverage(wqScores);
      const overallTVScore = calculateAverage(tvScores);

      const anyWQSubLow = anySubScoreLow(page, WQ_CRITERIA_KEYS);
      const anyTVSubLow = anySubScoreLow(page, TV_CRITERIA_KEYS);

      const wqRecommendation = getWritingQualityRecommendation(overallWQScore, anyWQSubLow);
      const tvRecommendation = getTopicValueRecommendation(overallTVScore, anyTVSubLow);
      
      return {
        ...page,
        OverallWQScore: parseFloat(overallWQScore.toFixed(2)),
        OverallTVScore: parseFloat(overallTVScore.toFixed(2)),
        AnyWQSubLow: anyWQSubLow,
        AnyTVSubLow: anyTVSubLow,
        WQRecommendation: wqRecommendation,
        TVRecommendation: tvRecommendation,
      };
    });
  }, [pagesData]);

  const actionNeededPages = useMemo(() => {
    return processedPagesData.filter(page => 
      CRITICAL_RECOMMENDATIONS.includes(page.WQRecommendation) || 
      CRITICAL_RECOMMENDATIONS.includes(page.TVRecommendation)
    );
  }, [processedPagesData]);

  const snapshotData = useMemo(() => {
    if (processedPagesData.length === 0) {
      return { avgWQ: 0, avgTV: 0, pagesBelowWQThreshold: 0, pagesBelowTVThreshold: 0, percentActionNeeded: 0, totalActionNeededCount: 0, totalPagesCount: 0 };
    }
    const totalPages = processedPagesData.length;
    const sumWQ = processedPagesData.reduce((sum, p) => sum + p.OverallWQScore, 0);
    const sumTV = processedPagesData.reduce((sum, p) => sum + p.OverallTVScore, 0);
    
    const wqThreshold = 6;
    const tvThreshold = 5;

    const belowWQ = processedPagesData.filter(p => p.OverallWQScore < wqThreshold).length;
    const belowTV = processedPagesData.filter(p => p.OverallTVScore < tvThreshold).length;
    
    return {
      avgWQ: (sumWQ / totalPages).toFixed(2),
      avgTV: (sumTV / totalPages).toFixed(2),
      pagesBelowWQThreshold: ((belowWQ / totalPages) * 100).toFixed(1),
      pagesBelowTVThreshold: ((belowTV / totalPages) * 100).toFixed(1),
      percentActionNeeded: ((actionNeededPages.length / totalPages) * 100).toFixed(1),
      totalActionNeededCount: actionNeededPages.length,
      totalPagesCount: totalPages,
    };
  }, [processedPagesData, actionNeededPages]);

  const toggleExpandRow = (pageId) => {
    setExpandedRow(expandedRow === pageId ? null : pageId);
  };

  const getScoreColor = (score) => {
    if (score >= 9) return 'bg-green-100 text-green-700';
    if (score >= 6) return 'bg-yellow-100 text-yellow-700';
    if (score >= 0) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };
  
  const getRecommendationIcon = (recommendation) => {
    if (recommendation.startsWith('✅')) return <CheckCircle className="inline mr-1 h-4 w-4 text-green-500" />;
    if (recommendation.startsWith('🔍')) return <Search className="inline mr-1 h-4 w-4 text-blue-500" />;
    if (recommendation.startsWith('🛠️')) return <AlertTriangle className="inline mr-1 h-4 w-4 text-yellow-500" />;
    if (recommendation.startsWith('⚠️')) return <AlertTriangle className="inline mr-1 h-4 w-4 text-orange-500" />;
    if (recommendation.startsWith('❌')) return <XCircle className="inline mr-1 h-4 w-4 text-red-500" />;
    if (recommendation.startsWith('ℹ️')) return <Info className="inline mr-1 h-4 w-4 text-gray-500" />;
    return null;
  };

  const sortData = (data, config) => {
    if (!config.key) return data;
    const sortedData = [...data].sort((a, b) => {
      if (a[config.key] < b[config.key]) {
        return config.direction === 'ascending' ? -1 : 1;
      }
      if (a[config.key] > b[config.key]) {
        return config.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
    return sortedData;
  };
  
  const requestSort = (key, currentConfig, setConfig) => {
    let direction = 'ascending';
    if (currentConfig.key === key && currentConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setConfig({ key, direction });
  };

  const filteredDetailedPages = useMemo(() => {
    let dataToFilter = sortData(processedPagesData, detailedViewSortConfig);
    if (!detailedViewFilter) {
      return dataToFilter;
    }
    return dataToFilter.filter(page =>
      page.PageTitle.toLowerCase().includes(detailedViewFilter.toLowerCase())
    );
  }, [processedPagesData, detailedViewSortConfig, detailedViewFilter]);

  const sortedActionNeededPages = useMemo(() => {
     return sortData(actionNeededPages, actionNeededSortConfig);
  }, [actionNeededPages, actionNeededSortConfig]);


  const renderTable = (data, config, setConfig, isActionNeededTable = false) => {
    const columns = [
      { key: 'PageTitle', name: 'Page Title', sortable: true },
      { key: 'OverallWQScore', name: 'WQ Score', sortable: true },
      { key: 'OverallTVScore', name: 'TV Score', sortable: true },
      { key: 'WQRecommendation', name: 'WQ Rec.', sortable: true },
      { key: 'TVRecommendation', name: 'TV Rec.', sortable: true },
    ];
    if (!isActionNeededTable) {
      columns.push({ key: 'AssessmentDate', name: 'Date', sortable: true });
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th> {/* Expand icon */}
              {columns.map(col => (
                <th key={col.key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => col.sortable && requestSort(col.key, config, setConfig)}
                    className="flex items-center hover:text-gray-700"
                  >
                    {col.name}
                    {col.sortable && config.key === col.key && (config.direction === 'ascending' ? ' ▲' : ' ▼')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map(page => (
              <React.Fragment key={page.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <button onClick={() => toggleExpandRow(page.id)} className="text-indigo-600 hover:text-indigo-800">
                      {expandedRow === page.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                    <a href={page.PageURL} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center">
                      {page.PageTitle} <ExternalLink size={12} className="ml-1" />
                    </a>
                  </td>
                  <td className={`px-4 py-2 whitespace-nowrap text-sm ${getScoreColor(page.OverallWQScore)}`}>{page.OverallWQScore}</td>
                  <td className={`px-4 py-2 whitespace-nowrap text-sm ${getScoreColor(page.OverallTVScore)}`}>{page.OverallTVScore}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                    {getRecommendationIcon(page.WQRecommendation)} {page.WQRecommendation}
                    {page.AnyWQSubLow && <Info size={12} className="inline ml-1 text-orange-500" title="One or more WQ sub-criteria <= 5" />}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                    {getRecommendationIcon(page.TVRecommendation)} {page.TVRecommendation}
                    {page.AnyTVSubLow && <Info size={12} className="inline ml-1 text-orange-500" title="One or more TV sub-criteria <= 5" />}
                  </td>
                  {!isActionNeededTable && <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{page.AssessmentDate}</td>}
                </tr>
                {expandedRow === page.id && (
                  <tr>
                    <td colSpan={isActionNeededTable ? 6 : 7} className="p-0">
                      <div className="bg-gray-50 p-4 m-2 border border-gray-200 rounded-md shadow-inner">
                        <h4 className="text-md font-semibold text-gray-700 mb-2">Sub-Criteria Scores for: {page.PageTitle}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h5 className="text-sm font-medium text-gray-600 mb-1">Writing Quality</h5>
                            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                              {WQ_CRITERIA_KEYS.map(key => (
                                <li key={key}><span className="font-medium">{WQ_CRITERIA_NAMES[key]}:</span> <span className={`font-bold ${getScoreColor(page[key])} px-1 rounded`}>{page[key]}</span></li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h5 className="text-sm font-medium text-gray-600 mb-1">Topic Value</h5>
                            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                              {TV_CRITERIA_KEYS.map(key => (
                                <li key={key}><span className="font-medium">{TV_CRITERIA_NAMES[key]}:</span> <span className={`font-bold ${getScoreColor(page[key])} px-1 rounded`}>{page[key]}</span></li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={isActionNeededTable ? 6 : 7} className="text-center py-4 text-gray-500">No data to display. Upload a CSV file.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCriteriaViewer = (type, text) => { // Renamed from renderCriteriaEditor
    const title = type === 'wq' ? "Writing Quality Criteria" : "Topic Value Criteria";
    const fileName = type === 'wq' ? wqCriteriaFileName : tvCriteriaFileName;
    return (
      <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-gray-700">{title}</h3>
          {fileName && <span className="text-sm text-gray-500">Loaded: {fileName}</span>}
        </div>
        <pre className="w-full h-96 p-2 border border-gray-200 bg-gray-50 rounded-md overflow-auto text-sm font-mono">
          {text || `No ${title} loaded. Upload the file in the main 'Upload Data Files' section.`}
        </pre>
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-800 text-center">Content Quality & Value Dashboard</h1>
      </header>

      {/* Main Upload Section */}
      <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><UploadCloud className="mr-2 text-indigo-600" />Upload Data Files</h2>
        
        {/* CSV Score Data Upload */}
        <div className="mb-6 p-4 border border-gray-200 rounded-lg">
            <h3 className="text-md font-medium text-gray-600 mb-2">1. Score Data (.csv)</h3>
            <p className="text-sm text-gray-600 mb-3">
            Expected columns: <code className="text-xs bg-gray-100 p-1 rounded">{EXPECTED_CSV_COLUMNS.join(', ')}</code>
            </p>
            <input
            type="file"
            accept=".csv"
            onChange={handleCsvFileUpload}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
            />
            {csvFileName && <p className="text-sm text-green-600 mt-2">Loaded: {csvFileName}</p>}
            {error && <p className="text-sm text-red-600 mt-2 p-2 bg-red-50 rounded-md">{error}</p>}
        </div>

        {/* Writing Quality Criteria File Upload */}
        <div className="mb-6 p-4 border border-gray-200 rounded-lg">
            <h3 className="text-md font-medium text-gray-600 mb-2">2. Writing Quality Criteria File (.txt)</h3>
            <input
              type="file"
              accept=".txt"
              onChange={(e) => handleCriteriaFileUpload(e, 'wq')}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 cursor-pointer"
            />
            {wqCriteriaFileName && <p className="text-sm text-green-600 mt-2">Loaded: {wqCriteriaFileName}</p>}
        </div>

        {/* Topic Value Criteria File Upload */}
        <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="text-md font-medium text-gray-600 mb-2">3. Topic Value Criteria File (.txt)</h3>
            <input
              type="file"
              accept=".txt"
              onChange={(e) => handleCriteriaFileUpload(e, 'tv')}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100 cursor-pointer"
            />
            {tvCriteriaFileName && <p className="text-sm text-green-600 mt-2">Loaded: {tvCriteriaFileName}</p>}
        </div>
      </div>


      {/* Navigation Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-4 md:space-x-8" aria-label="Tabs">
            {[
              { name: 'Snapshot', id: 'snapshot', icon: LayoutDashboard },
              { name: 'Action Needed', id: 'actionNeeded', icon: ListChecks },
              { name: 'Detailed View', id: 'detailedView', icon: TableIcon },
              { name: 'Criteria Docs', id: 'criteriaDocs', icon: BookOpen },
            ].map((tab) => (
              <button
                key={tab.name}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm md:text-base flex items-center group`}
              >
                <tab.icon className={`mr-2 h-5 w-5 ${activeTab === tab.id ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
                {tab.name}
                {tab.id === 'actionNeeded' && actionNeededPages.length > 0 && (
                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${activeTab === tab.id ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}>
                    {actionNeededPages.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'snapshot' && (
        <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
          <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><TrendingUp className="mr-2 text-indigo-600" />Performance Snapshot</h2>
          {processedPagesData.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-indigo-50 p-4 rounded-lg shadow">
                <h3 className="text-sm font-medium text-indigo-700">Avg. Writing Quality</h3>
                <p className="text-2xl font-bold text-indigo-900">{snapshotData.avgWQ}</p>
              </div>
              <div className="bg-teal-50 p-4 rounded-lg shadow">
                <h3 className="text-sm font-medium text-teal-700">Avg. Topic Value</h3>
                <p className="text-2xl font-bold text-teal-900">{snapshotData.avgTV}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg shadow">
                <h3 className="text-sm font-medium text-red-700">Pages Below WQ Threshold (&lt;6)</h3>
                <p className="text-2xl font-bold text-red-900">{snapshotData.pagesBelowWQThreshold}%</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg shadow">
                <h3 className="text-sm font-medium text-orange-700">Pages Below TV Threshold (&lt;5)</h3>
                <p className="text-2xl font-bold text-orange-900">{snapshotData.pagesBelowTVThreshold}%</p>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg shadow">
                <h3 className="text-sm font-medium text-yellow-700">Pages Needing Action</h3>
                <p className="text-2xl font-bold text-yellow-900">{snapshotData.percentActionNeeded}% ({snapshotData.totalActionNeededCount} / {snapshotData.totalPagesCount})</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Upload a CSV score data file to see the snapshot.</p>
          )}
        </div>
      )}

      {activeTab === 'actionNeeded' && (
        <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
          <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><AlertTriangle className="mr-2 text-red-600" />Action Needed List ({actionNeededPages.length})</h2>
          {renderTable(sortedActionNeededPages, actionNeededSortConfig, setActionNeededSortConfig, true)}
        </div>
      )}

      {activeTab === 'detailedView' && (
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><FileText className="mr-2 text-indigo-600" />Detailed Page Scores ({processedPagesData.length})</h2>
          <div className="mb-4">
            <label htmlFor="filterDetailed" className="sr-only">Filter pages</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Filter className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="filterDetailed"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Filter by Page Title..."
                value={detailedViewFilter}
                onChange={(e) => setDetailedViewFilter(e.target.value)}
              />
            </div>
          </div>
          {renderTable(filteredDetailedPages, detailedViewSortConfig, setDetailedViewSortConfig)}
        </div>
      )}

      {activeTab === 'criteriaDocs' && (
        <div>
          {renderCriteriaViewer('wq', wqCriteriaText)} 
          {renderCriteriaViewer('tv', tvCriteriaText)}
        </div>
      )}
    </div>
  );
}

export default App;

