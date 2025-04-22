import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import './ManageWorkers.css';


// Define the Worker interface
interface Worker {
  id: string;
  name: string;
  // Add other properties as necessary
}

const ManageWorkers: React.FC = () => {
  const { user, detail } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);



  useEffect(() => {
    if (!detail || !detail.agentId) return;

    const fetchWorkers = async () => {
      const q = query(
        collection(db, 'users'), 
        where('role', '==', 'worker'), 
        where('agentId', '==', detail.agentId)
      );
      const querySnapshot = await getDocs(q);
      const fetchedWorkers = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Worker, 'id'>), // Cast the document data to Worker, excluding 'id' which is manually added
      }));
      setWorkers(fetchedWorkers);
    };

    fetchWorkers();
  }, [detail]);

  const isAgentOrManager = detail?.role === 'agent' || detail?.role === 'manager';

  return (
    <div className="frame-container">
      <div className="table-header">
        <div className="table-title">ניהול עובדים</div>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>שם עובד</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) => (
              <tr key={worker.id}>
                <td>{worker.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAgentOrManager && (
        <div className="add_worker">
          <Link href={`/auth/sign-up/${user?.uid}`} className="text-custom-link">
            צור עובד חדש
          </Link>
        </div>
      )}
    </div>
  );
};
export default ManageWorkers;
