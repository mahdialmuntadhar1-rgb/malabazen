import React, { useState, useEffect, useCallback } from 'react';
import { Send, Users, RefreshCw, Webhook, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface WebhookLog {
  id: string;
  event_type: string;
  payload: any;
  processed: boolean;
  created_at: string;
  error_message?: string;
}

interface SendResult {
  phone: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

export default function NabdaDashboard() {
  const [activeTab, setActiveTab] = useState<'send' | 'logs'>('send');
  
  // Single message state
  const [singlePhone, setSinglePhone] = useState('');
  const [singleMessage, setSingleMessage] = useState('');
  const [singleResult, setSingleResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);
  
  // Bulk message state
  const [bulkNumbers, setBulkNumbers] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkResults, setBulkResults] = useState<SendResult[]>([]);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  
  // Logs state
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch webhook logs
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const response = await fetch('/api/nabda-dashboard/logs?limit=50');
      const data = await response.json();
      if (data.success) {
        setLogs(data.data);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // Auto-refresh logs
  useEffect(() => {
    if (activeTab === 'logs' && autoRefresh) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, autoRefresh, fetchLogs]);

  // Send single message
  const handleSendSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singlePhone || !singleMessage) {
      setSingleResult({ success: false, error: 'Phone and message are required' });
      return;
    }

    setSingleResult({ message: 'Sending...' });
    try {
      const response = await fetch('/api/nabda-dashboard/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: singlePhone, message: singleMessage })
      });
      const data = await response.json();
      
      if (data.success) {
        setSingleResult({ 
          success: true, 
          message: `Sent! Message ID: ${data.data.messageId || 'unknown'}` 
        });
      } else {
        setSingleResult({ 
          success: false, 
          error: data.error || 'Failed to send' 
        });
      }
    } catch (err) {
      setSingleResult({ success: false, error: 'Network error' });
    }
  };

  // Send bulk messages
  const handleSendBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const phones = bulkNumbers.split('\n').map(p => p.trim()).filter(p => p);
    
    if (phones.length === 0 || !bulkMessage) {
      alert('Please enter at least one phone number and a message');
      return;
    }

    setIsSendingBulk(true);
    setBulkResults([]);
    setBulkProgress({ current: 0, total: phones.length });

    try {
      const response = await fetch('/api/nabda-dashboard/send-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones, message: bulkMessage })
      });
      const data = await response.json();
      
      if (data.success) {
        setBulkResults(data.results);
        setBulkProgress({ current: phones.length, total: phones.length });
      } else {
        alert(data.error || 'Bulk send failed');
      }
    } catch (err) {
      alert('Network error during bulk send');
    } finally {
      setIsSendingBulk(false);
    }
  };

  const renderSendTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Single Message */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Send className="w-5 h-5 mr-2 text-blue-600" />
          Send Single Message
        </h3>
        
        <form onSubmit={handleSendSingle} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="text"
              value={singlePhone}
              onChange={(e) => setSinglePhone(e.target.value)}
              placeholder="+9647701234567 or 07701234567"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Iraqi format: +9647XXXXXXXXX or 07XXXXXXXX
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              value={singleMessage}
              onChange={(e) => setSingleMessage(e.target.value)}
              rows={4}
              placeholder="Enter your message here..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <button
            type="submit"
            disabled={!singlePhone || !singleMessage}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Send Message
          </button>
        </form>
        
        {singleResult && (
          <div className={`mt-4 p-3 rounded-md ${
            singleResult.success === true ? 'bg-green-50 text-green-800' :
            singleResult.success === false ? 'bg-red-50 text-red-800' :
            'bg-blue-50 text-blue-800'
          }`}>
            <div className="flex items-center">
              {singleResult.success === true && <CheckCircle className="w-5 h-5 mr-2" />}
              {singleResult.success === false && <XCircle className="w-5 h-5 mr-2" />}
              {singleResult.success === undefined && <AlertCircle className="w-5 h-5 mr-2" />}
              <span>{singleResult.message || singleResult.error}</span>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Messages */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Users className="w-5 h-5 mr-2 text-green-600" />
          Send Bulk Messages
        </h3>
        
        <form onSubmit={handleSendBulk} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Numbers (one per line)
            </label>
            <textarea
              value={bulkNumbers}
              onChange={(e) => setBulkNumbers(e.target.value)}
              rows={5}
              placeholder="+9647701234567&#10;07701234567&#10;+9647709876543"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message (same for all)
            </label>
            <textarea
              value={bulkMessage}
              onChange={(e) => setBulkMessage(e.target.value)}
              rows={3}
              placeholder="Enter message for all recipients..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          
          <button
            type="submit"
            disabled={isSendingBulk || !bulkNumbers || !bulkMessage}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isSendingBulk ? `Sending ${bulkProgress.current}/${bulkProgress.total}...` : 'Send Bulk'}
          </button>
        </form>
        
        {bulkResults.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium mb-2">Results:</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {bulkResults.map((result, idx) => (
                <div 
                  key={idx} 
                  className={`flex items-center justify-between p-2 rounded text-sm ${
                    result.success ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  <span className="font-mono text-xs">{result.phone}</span>
                  {result.success ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 text-sm text-gray-600">
              {bulkResults.filter(r => r.success).length} sent, {' '}
              {bulkResults.filter(r => !r.success).length} failed
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderLogsTab = () => (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center">
          <Webhook className="w-5 h-5 mr-2 text-purple-600" />
          Webhook Logs
        </h3>
        <div className="flex items-center space-x-4">
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2"
            />
            Auto-refresh (5s)
          </label>
          <button
            onClick={fetchLogs}
            disabled={logsLoading}
            className="flex items-center px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${logsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
      
      <div className="p-4">
        {logs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No webhook events received yet.
            <br />
            <span className="text-sm">Send a message or wait for incoming webhooks.</span>
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {logs.map((log) => (
              <div 
                key={log.id} 
                className={`border rounded-lg p-3 ${
                  log.processed ? 'border-gray-200' : 'border-yellow-300 bg-yellow-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">
                    {log.event_type || 'unknown'}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs px-2 py-1 rounded ${
                      log.processed 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {log.processed ? 'Processed' : 'Pending'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                
                <div className="bg-gray-900 text-gray-100 rounded p-2 overflow-x-auto">
                  <pre className="text-xs font-mono">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                </div>
                
                {log.error_message && (
                  <div className="mt-2 text-xs text-red-600">
                    Error: {log.error_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">📲 Nabda WhatsApp Dashboard</h1>
      
      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
        <button
          onClick={() => setActiveTab('send')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'send'
              ? 'bg-white text-blue-600 shadow'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Send className="w-4 h-4 inline mr-1" />
          Send Messages
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'logs'
              ? 'bg-white text-purple-600 shadow'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Webhook className="w-4 h-4 inline mr-1" />
          Webhook Logs
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'send' ? renderSendTab() : renderLogsTab()}
    </div>
  );
}
