/**
 * DataService — provides data for the dashboard charts.
 * In production this would fetch from the GBOS API.
 * Currently returns demo data for visualization development.
 */
const DataService = (() => {

  /**
   * Get summary stats for the stat cards.
   * @returns {Promise<Object>}
   */
  async function getStats() {
    return {
      totalRecords: 24853,
      migrated: 21407,
      pending: 2918,
      errors: 528,
      trends: {
        totalRecords: [18200, 19400, 20100, 21800, 22900, 24100, 24853],
        migrated: [15800, 16900, 18200, 19100, 20300, 20900, 21407],
        pending: [4200, 3800, 3500, 3100, 2900, 2850, 2918],
        errors: [890, 780, 710, 640, 590, 550, 528],
      },
    };
  }

  /**
   * Get migration progress data per source.
   * @returns {Promise<Object[]>}
   */
  async function getMigrationProgress() {
    return [
      { label: 'PostgreSQL', value: 8420, max: 9000, color: '#6366f1' },
      { label: 'MongoDB', value: 5230, max: 7200, color: '#3b82f6' },
      { label: 'MySQL', value: 4100, max: 4500, color: '#22c55e' },
      { label: 'Redis', value: 2150, max: 2400, color: '#eab308' },
      { label: 'Elasticsearch', value: 1507, max: 1753, color: '#f97316' },
    ];
  }

  /**
   * Get migration volume over time for the line chart.
   * @returns {Promise<Object[]>}
   */
  async function getMigrationTimeline() {
    return [
      { label: 'Jan', value: 2400 },
      { label: 'Feb', value: 3800 },
      { label: 'Mar', value: 3200 },
      { label: 'Apr', value: 5100 },
      { label: 'May', value: 4700 },
      { label: 'Jun', value: 6200 },
      { label: 'Jul', value: 7100 },
    ];
  }

  /**
   * Get task status breakdown for the donut chart.
   * @returns {Promise<Object[]>}
   */
  async function getTaskBreakdown() {
    return [
      { label: 'Completed', value: 142, color: '#22c55e' },
      { label: 'In Progress', value: 28, color: '#6366f1' },
      { label: 'Pending', value: 45, color: '#eab308' },
      { label: 'Failed', value: 12, color: '#ef4444' },
    ];
  }

  /**
   * Get recent activity entries.
   * @returns {Promise<Object[]>}
   */
  async function getRecentActivity() {
    const now = Date.now();
    return [
      { time: new Date(now - 120000).toISOString(), message: 'Migration batch #847 completed', type: 'success' },
      { time: new Date(now - 420000).toISOString(), message: 'New data source connected: Redis', type: 'info' },
      { time: new Date(now - 900000).toISOString(), message: 'Schema validation passed for PostgreSQL', type: 'success' },
      { time: new Date(now - 1800000).toISOString(), message: '3 records failed validation in MongoDB', type: 'warning' },
      { time: new Date(now - 3600000).toISOString(), message: 'Elasticsearch indexing started', type: 'info' },
      { time: new Date(now - 7200000).toISOString(), message: 'Backup completed for MySQL', type: 'success' },
    ];
  }

  /**
   * Get data source status.
   * @returns {Promise<Object[]>}
   */
  async function getDataSources() {
    return [
      { name: 'PostgreSQL', status: 'connected', records: 9000 },
      { name: 'MongoDB', status: 'connected', records: 7200 },
      { name: 'MySQL', status: 'connected', records: 4500 },
      { name: 'Redis', status: 'syncing', records: 2400 },
      { name: 'Elasticsearch', status: 'connected', records: 1753 },
    ];
  }

  /**
   * Get data quality score.
   * @returns {Promise<number>}
   */
  async function getDataQuality() {
    return 87;
  }

  return {
    getStats,
    getMigrationProgress,
    getMigrationTimeline,
    getTaskBreakdown,
    getRecentActivity,
    getDataSources,
    getDataQuality,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataService;
}
