export interface NonPlantillaEmployee {
  id: string;
  surname: string;
  first_name: string;
  middle_name: string;
  complete_name: string;
  school: string;
  designation: string;
  pagibig_number: string;
  philhealth: string;
  landbank: string;
  first_day_of_service: string | null;
  contact_number: string;
  birthday: string | null;
  sex: string;
  address: string;
  civil_status: string;
  tin: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface NonPlantillaForm {
  surname: string;
  first_name: string;
  middle_name: string;
  school: string;
  designation: string;
  pagibig_number: string;
  philhealth: string;
  landbank: string;
  first_day_of_service: string | null;
  contact_number: string;
  birthday: string | null;
  sex: string;
  address: string;
  civil_status: string;
  tin: string;
}

export function emptyNonPlantillaForm(): NonPlantillaForm {
  return {
    surname: '',
    first_name: '',
    middle_name: '',
    school: '',
    designation: '',
    pagibig_number: '',
    philhealth: '',
    landbank: '',
    first_day_of_service: null,
    contact_number: '',
    birthday: null,
    sex: '',
    address: '',
    civil_status: '',
    tin: '',
  };
}

export function formFromNonPlantilla(e: NonPlantillaEmployee): NonPlantillaForm {
  return {
    surname: e.surname,
    first_name: e.first_name,
    middle_name: e.middle_name ?? '',
    school: e.school,
    designation: e.designation,
    pagibig_number: e.pagibig_number ?? '',
    philhealth: e.philhealth ?? '',
    landbank: e.landbank ?? '',
    first_day_of_service: e.first_day_of_service,
    contact_number: e.contact_number ?? '',
    birthday: e.birthday,
    sex: e.sex ?? '',
    address: e.address ?? '',
    civil_status: e.civil_status ?? '',
    tin: e.tin ?? '',
  };
}
