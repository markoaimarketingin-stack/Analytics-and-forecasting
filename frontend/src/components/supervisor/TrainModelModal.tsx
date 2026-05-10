import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { BrainCircuit, FileText, LoaderCircle, Upload, X } from 'lucide-react';

import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';
import { uploadAgentFile } from '../../services/api';

interface TrainModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: string;
}

const TRAINING_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'events', label: 'Events' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'customers', label: 'Customers' },
  { value: 'retention', label: 'Retention' },
];

const S3_ACCESS_POLICY = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadAccess",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetObject"],
      "Resource": [
        "arn:aws:s3:::YOUR_BUCKET_NAME",
        "arn:aws:s3:::YOUR_BUCKET_NAME/*"
      ]
    }
  ]
}`;

export default function TrainModelModal({ isOpen, onClose, clientId }: TrainModelModalProps) {
  const { currentAgentId } = useKnowledgeBase();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [category, setCategory] = useState('general');
  const [instructions, setInstructions] = useState('');
  const [dataSource, setDataSource] = useState<'upload' | 's3'>('upload');
  const [roleArn, setRoleArn] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const acceptedTypes = '.pdf,.doc,.docx,.txt,.csv,.json,.md';

  const fileSummary = useMemo(() => {
    if (selectedFiles.length === 0) return 'No files selected yet';
    if (selectedFiles.length === 1) return selectedFiles[0].name;
    return `${selectedFiles.length} files selected`;
  }, [selectedFiles]);

  const resetState = () => {
    setSelectedFiles([]);
    setDragActive(false);
    setCategory('general');
    setInstructions('');
    setDataSource('upload');
    setRoleArn('');
    setIsSubmitting(false);
    setError(null);
    setSuccessMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetState();
    onClose();
  };

  const mergeFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;

    const nextFiles = Array.from(incoming);
    setSelectedFiles((prev) => {
      const seen = new Set(prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const merged = [...prev];

      nextFiles.forEach((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      });

      return merged;
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    mergeFiles(event.target.files);
  };

  const handleDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true);
      return;
    }
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    mergeFiles(event.dataTransfer.files);
  };

  const handleRemoveFile = (targetFile: File) => {
    setSelectedFiles((prev) =>
      prev.filter(
        (file) =>
          !(
            file.name === targetFile.name &&
            file.size === targetFile.size &&
            file.lastModified === targetFile.lastModified
          ),
      ),
    );
  };

  const handleTrainModel = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (dataSource === 's3') {
        if (!roleArn.trim()) {
          throw new Error('Please enter your Role ARN to continue.');
        }
        setSuccessMessage('S3 connection details captured for this session.');
        return;
      }

      if (selectedFiles.length === 0) {
        throw new Error('Please select at least one file to upload.');
      }

      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          await uploadAgentFile(file, currentAgentId, {
            clientId,
            category,
            instructions,
          });
        }
      }

      setSuccessMessage(
        `Upload complete. ${selectedFiles.length} file${selectedFiles.length > 1 ? 's have' : ' has'} been added to the knowledge base under "${category}".`,
      );
    } catch (trainError) {
      const message =
        trainError instanceof Error ? trainError.message : 'Upload could not be completed.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-[0_20px_52px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-[22px] font-extrabold tracking-tight text-gray-900">Train Analytics Supervisor</h2>
            <p className="mt-1 text-sm text-gray-500">Upload files or connect S3 to train the agent.</p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close train model modal"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <section>
              <h3 className="text-lg font-semibold text-gray-700">Data Source</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDataSource('upload');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`rounded-[16px] border px-4 py-3 text-sm font-semibold transition ${
                    dataSource === 'upload'
                      ? 'border-black bg-black text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Upload Data
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDataSource('s3');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`rounded-[16px] border px-4 py-3 text-sm font-semibold transition ${
                    dataSource === 's3'
                      ? 'border-black bg-black text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Connect S3
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">Choose how you want to provide data for training.</p>
            </section>

            {dataSource === 'upload' ? (
              <section>
                <h3 className="text-lg font-semibold text-gray-700">Upload Training Assets</h3>
                <div
                  className={`mt-3 rounded-[20px] border-[2px] border-dashed px-4 py-5 text-center transition ${
                    dragActive
                      ? 'border-blue-400 bg-blue-50'
                      : selectedFiles.length > 0
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-gray-300 bg-gray-50'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={acceptedTypes}
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                    <Upload className="h-6 w-6" />
                  </div>

                  <p className="mt-3 text-base font-semibold text-gray-900">Click to upload or drag and drop</p>
                  <p className="mt-1 text-sm text-gray-500">PDF, DOCX/DOC, TXT, CSV, JSON, MD files</p>
                  <p className="mt-3 text-sm font-medium text-gray-600">{fileSummary}</p>
                </div>

                {selectedFiles.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedFiles.map((file) => (
                      <div
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm"
                      >
                        <FileText className="h-3.5 w-3.5 text-gray-500" />
                        <span className="max-w-[200px] truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRemoveFile(file);
                          }}
                          className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : (
              <section>
                <h3 className="text-lg font-semibold text-gray-700">Connect S3</h3>
                <div className="mt-3 rounded-[18px] border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  <ol className="space-y-2 pl-4">
                    <li className="list-decimal">Go to AWS console.</li>
                    <li className="list-decimal">Create IAM role.</li>
                    <li className="list-decimal">Paste this policy.</li>
                    <li className="list-decimal">Enter your Role ARN.</li>
                  </ol>

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Policy</p>
                    <pre className="mt-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-3 text-xs text-gray-700">
                      {S3_ACCESS_POLICY}
                    </pre>
                  </div>

                  <div className="mt-4">
                    <label htmlFor="train-model-role-arn" className="block text-sm font-semibold text-gray-700">
                      Role ARN
                    </label>
                    <input
                      id="train-model-role-arn"
                      value={roleArn}
                      onChange={(event) => setRoleArn(event.target.value)}
                      placeholder="arn:aws:iam::123456789012:role/YourAppAccessRole"
                      className="mt-2 h-11 w-full rounded-[14px] border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-gray-700 focus:ring-4 focus:ring-gray-100"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Example: arn:aws:iam::123456789012:role/YourAppAccessRole
                    </p>
                  </div>
                </div>
              </section>
            )}

            {dataSource === 'upload' ? (
              <section>
                <label htmlFor="train-model-category" className="block text-base font-semibold text-gray-700">
                  Category
                </label>
                <select
                  id="train-model-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-2 h-11 w-full rounded-[14px] border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                >
                  {TRAINING_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Choose a category to organize uploaded data.</p>
              </section>
            ) : null}

            {dataSource === 'upload' ? (
              <section>
                <label htmlFor="train-model-instructions" className="block text-base font-semibold text-gray-700">
                  Instructions <span className="text-gray-400">(Optional)</span>
                </label>
                <textarea
                  id="train-model-instructions"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder='Give instructions for the analytics agent, for example: "Prioritize forecasting accuracy for paid media campaigns and use uploaded benchmarks for context."'
                  className="mt-2 min-h-[88px] w-full rounded-[14px] border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Uploaded files are saved to the knowledge base for this agent and client.
                </p>
              </section>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-white px-5 py-3.5">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTrainModel}
            disabled={isSubmitting}
            className="inline-flex min-w-[160px] items-center justify-center gap-2.5 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(0,0,0,0.2)] transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="h-4.5 w-4.5 animate-spin" />
                Training...
              </>
            ) : (
              <>
                <BrainCircuit className="h-4.5 w-4.5" />
                Train
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
