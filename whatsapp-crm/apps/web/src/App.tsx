import React, { useState } from 'react';
import { supabase } from './lib/supabase';
import { Send, Users, MessageSquare, Settings, BarChart3, Phone, Smartphone } from 'lucide-react';
import NabdaDashboard from './components/NabdaDashboard';

interface Contact {
  id: string;
  business_name: string;
  normalized_phone: string;
  whatsapp_status?: string;
  governorate?: string;
  category?: string;
}

interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  template_type: string;
  is_active: boolean;
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [messageText, setMessageText] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Load data on component mount
  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [contactsData, templatesData] = await Promise.all([
        supabase.from('contacts').select('*').limit(50),
        supabase.from('message_templates').select('*').eq('is_active', true)
      ]);

      if (contactsData.data) setContacts(contactsData.data as Contact[]);
      if (templatesData.data) setTemplates(templatesData.data as MessageTemplate[]);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText || selectedContacts.length === 0) {
      alert('Please select contacts and enter a message');
      return;
    }

    setLoading(true);
    try {
      // This would integrate with your backend API to send messages
      const response = await fetch('/api/send-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: selectedContacts,
          message: messageText,
          template_id: selectedTemplate
        })
      });

      if (response.ok) {
        alert('Messages sent successfully!');
        setSelectedContacts([]);
        setMessageText('');
        loadData(); // Refresh data
      } else {
        alert('Failed to send messages');
      }
    } catch (error) {
      console.error('Error sending messages:', error);
      alert('Error sending messages');
    } finally {
      setLoading(false);
    }
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const renderDashboard = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center">
          <Users className="h-8 w-8 text-blue-600" />
          <div className="ml-4">
            <p className="text-sm text-gray-600">Total Contacts</p>
            <p className="text-2xl font-bold">{contacts.length}</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center">
          <MessageSquare className="h-8 w-8 text-green-600" />
          <div className="ml-4">
            <p className="text-sm text-gray-600">Templates</p>
            <p className="text-2xl font-bold">{templates.length}</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center">
          <Send className="h-8 w-8 text-purple-600" />
          <div className="ml-4">
            <p className="text-sm text-gray-600">Sent Today</p>
            <p className="text-2xl font-bold">
              {contacts.filter(c => c.whatsapp_status === 'sent').length}
            </p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center">
          <BarChart3 className="h-8 w-8 text-orange-600" />
          <div className="ml-4">
            <p className="text-sm text-gray-600">Pending</p>
            <p className="text-2xl font-bold">
              {contacts.filter(c => !c.whatsapp_status).length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContacts = () => (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Contacts</h3>
      </div>
      <div className="p-6">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {contacts.map(contact => (
            <div key={contact.id} className="flex items-center p-3 border rounded-lg hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selectedContacts.includes(contact.id)}
                onChange={() => toggleContactSelection(contact.id)}
                className="mr-3"
              />
              <div className="flex-1">
                <p className="font-medium">{contact.business_name}</p>
                <p className="text-sm text-gray-600">{contact.normalized_phone}</p>
                <p className="text-xs text-gray-500">
                  {contact.governorate} - {contact.category}
                </p>
              </div>
              <div className="text-sm">
                <span className={`px-2 py-1 rounded ${
                  contact.whatsapp_status === 'sent' ? 'bg-green-100 text-green-800' :
                  contact.whatsapp_status === 'failed' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {contact.whatsapp_status || 'pending'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderMessaging = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Compose Message</h3>
        </div>
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template (Optional)
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select a template</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Type your message here..."
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {selectedContacts.length} contacts selected
            </span>
            <button
              onClick={handleSendMessage}
              disabled={loading || !messageText || selectedContacts.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Messages'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Templates</h3>
        </div>
        <div className="p-6">
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {templates.map(template => (
              <div key={template.id} className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                   onClick={() => setMessageText(template.body)}>
                <p className="font-medium">{template.name}</p>
                <p className="text-sm text-gray-600 mt-1">{template.body}</p>
                <p className="text-xs text-gray-500 mt-1">{template.template_type}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Phone className="h-8 w-8 text-blue-600" />
              <h1 className="ml-3 text-2xl font-bold text-gray-900">WhatsApp CRM</h1>
            </div>
            <span className="text-sm text-gray-600">Iraq Business Outreach</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex space-x-1 mb-8">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'contacts', label: 'Contacts', icon: Users },
            { id: 'messaging', label: 'Messaging', icon: Send },
            { id: 'nabda', label: 'Nabda', icon: Smartphone },
            { id: 'settings', label: 'Settings', icon: Settings }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 rounded-md ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'contacts' && renderContacts()}
        {activeTab === 'messaging' && renderMessaging()}
        {activeTab === 'nabda' && <NabdaDashboard />}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Settings</h3>
            <p className="text-gray-600">CRM settings and configuration coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
